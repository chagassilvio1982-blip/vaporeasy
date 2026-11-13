-- DRAFT ONLY. Do not apply to production without isolated integration tests.
-- Atomic server-side issuance of selected monthly items.
-- Billing documents are not paid receipts; keep separate records.
create table if not exists public.monthly_billing_documents (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id),
 competence_month date not null,
 snapshot jsonb not null,
 issued_by uuid not null,
 issued_at timestamptz not null default now(),
 unique(client_id,competence_month)
);
alter table public.monthly_billing_documents enable row level security;
revoke all on public.monthly_billing_documents from anon, authenticated;
grant select on public.monthly_billing_documents to authenticated;
drop policy if exists monthly_billing_documents_select on public.monthly_billing_documents;
create policy monthly_billing_documents_select on public.monthly_billing_documents
 for select to authenticated using (auth.uid() is not null and private.is_active_user()
 and private.current_app_role() in ('owner','admin'));

create or replace function public.issue_selected_monthly_receipt(
  p_client_id uuid, p_competence date, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_item jsonb; v_id uuid; v_kind text; v_amount numeric;
  v_total numeric := 0; v_count int := 0; v_doc uuid;
  v_verified_lines jsonb := '[]'::jsonb;
  v_charge public.package_charges%rowtype;
  v_appointment public.appointments%rowtype;
  v_correction public.appointment_financial_corrections%rowtype;
  v_client_name text; v_vehicle_id uuid; v_service_id uuid; v_service_date date;
  v_vehicle_label text; v_service_label text;
begin
  if auth.uid() is null or not private.is_active_user()
     or private.current_app_role() not in ('owner','admin') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if p_client_id is null or p_competence is null
     or p_competence <> date_trunc('month',p_competence)::date
     or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'Invalid receipt request';
  end if;
  select name into v_client_name from public.clients where id=p_client_id;
  if not found then raise exception 'Client not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_id::text || ':' || p_competence::text,0));
  if exists(select 1 from public.monthly_receipt_snapshots
            where client_id=p_client_id and competence_month=p_competence) then
    raise exception 'Monthly receipt already issued in legacy history';
  end if;
  if exists(select 1 from public.monthly_billing_documents
            where client_id=p_client_id and competence_month=p_competence) then
    raise exception 'Monthly receipt already issued';
  end if;
  if exists(select 1 from jsonb_array_elements(p_lines) x
            where jsonb_typeof(x) <> 'object'
               or x->>'kind' not in ('package_charge','appointment_extra')
               or x->>'id' is null or x->>'amount' is null) then
    raise exception 'Malformed receipt item';
  end if;
  if (select count(*) from jsonb_array_elements(p_lines) x)
     <> (select count(distinct (x->>'kind') || ':' || (x->>'id')) from jsonb_array_elements(p_lines) x) then
    raise exception 'Duplicate receipt item';
  end if;
  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_count := v_count + 1;
    v_kind := v_item->>'kind';
    v_id := (v_item->>'id')::uuid;
    if v_kind = 'package_charge' then
      select * into v_charge from public.package_charges where id=v_id for update;
      if not found or v_charge.client_id is distinct from p_client_id
         or v_charge.competence_month is distinct from p_competence or v_charge.status is distinct from 'pending' then
        raise exception 'Package charge not eligible';
      end if;
      if not exists(
        select 1 from public.package_subscriptions s
        where s.id=v_charge.subscription_id
          and s.client_id=p_client_id
          and s.vehicle_id=v_charge.vehicle_id
          and s.service_id=v_charge.service_id
      ) then
        raise exception 'Package charge subscription does not match client, vehicle and service';
      end if;
      v_vehicle_id := v_charge.vehicle_id;
      v_service_id := v_charge.service_id;
      v_service_date := null;
      v_amount := v_charge.amount;
    elsif v_kind = 'appointment_extra' then
      select * into v_appointment from public.appointments where id=v_id for update;
      if not found or v_appointment.client_id is distinct from p_client_id
         or v_appointment.status is distinct from 'completed' or v_appointment.deleted_at is not null
         or (v_appointment.starts_at at time zone 'America/Sao_Paulo')::date < p_competence
         or (v_appointment.starts_at at time zone 'America/Sao_Paulo')::date >= (p_competence + interval '1 month')::date
         or exists(select 1 from public.appointment_payments
                   where appointment_id=v_id and status='paid')
         or exists(select 1 from public.package_subscriptions s
                   where not exists(select 1 from public.appointment_financial_corrections fc
                                    where fc.appointment_id=v_id and fc.classification='avulso')
                     and s.client_id=p_client_id and s.vehicle_id=v_appointment.vehicle_id
                     and s.service_id=v_appointment.service_id
                     and s.starts_on <= (v_appointment.starts_at at time zone 'America/Sao_Paulo')::date
                     and (s.superseded_at is null or (s.superseded_at at time zone 'America/Sao_Paulo')::date >= (v_appointment.starts_at at time zone 'America/Sao_Paulo')::date)
                     and not exists(
                       select 1 from public.package_subscriptions replacement
                       where replacement.replaces_subscription_id=s.id
                         and replacement.scheduled_effective_on is not null
                         and replacement.scheduled_effective_on <= (v_appointment.starts_at at time zone 'America/Sao_Paulo')::date
                     ))
      then
        raise exception 'Appointment not eligible';
      end if;
      select * into v_correction from public.appointment_financial_corrections
        where appointment_id=v_id;
      if v_correction.appointment_id is not null
         and (v_correction.classification is distinct from 'avulso'
              or v_correction.client_id is distinct from v_appointment.client_id) then
        raise exception 'Appointment correction is not valid for this client or classified as plan';
      end if;
      if v_appointment.recurring_plan_id is not null
         and (not found or v_correction.classification is distinct from 'avulso') then
        raise exception 'Recurring appointment requires explicit avulso correction';
      end if;
      v_vehicle_id := v_appointment.vehicle_id;
      v_service_id := v_appointment.service_id;
      v_service_date := (v_appointment.starts_at at time zone 'America/Sao_Paulo')::date;
      v_amount := coalesce(v_correction.corrected_final_value,v_appointment.final_value);
    else
      raise exception 'Unsupported item type';
    end if;
    select concat_ws(' ',nullif(btrim(brand),''),nullif(btrim(model),''))
           || case when nullif(btrim(plate),'') is null then '' else ' • '||btrim(plate) end
      into v_vehicle_label
      from public.vehicles where id=v_vehicle_id and client_id=p_client_id;
    if not found then raise exception 'Vehicle does not belong to selected client'; end if;
    select name into v_service_label from public.services where id=v_service_id;
    if not found then raise exception 'Service not found'; end if;
    if v_amount is null or v_amount <= 0
       or round(v_amount,2) <> v_amount
       or v_amount <> (v_item->>'amount')::numeric then
      raise exception 'Amount mismatch';
    end if;
    v_total := v_total + v_amount;
    v_verified_lines := v_verified_lines || jsonb_build_array(jsonb_build_object(
      'kind',v_kind,'item_label',case when v_kind='package_charge' then 'Mensalidade do plano' else 'Atendimento avulso' end,
      'id',v_id,'amount',v_amount,'vehicle_id',v_vehicle_id,'vehicle_label',v_vehicle_label,
      'service_id',v_service_id,'service_label',v_service_label,'service_date',v_service_date
    ));
  end loop;
  insert into public.monthly_billing_documents(client_id,competence_month,snapshot,issued_by)
  values(p_client_id,p_competence,jsonb_build_object(
    'schema_version',3,'kind','selected_monthly_receipt',
    'client_name',v_client_name,'competence_month',p_competence,
    'lines',v_verified_lines,'total',v_total,'item_count',v_count
  ),auth.uid()) returning id into v_doc;
  return v_doc;
end;
$$;
revoke all on function public.issue_selected_monthly_receipt(uuid,date,jsonb) from public;
revoke execute on function public.issue_selected_monthly_receipt(uuid,date,jsonb) from anon;
grant execute on function public.issue_selected_monthly_receipt(uuid,date,jsonb) to authenticated;
