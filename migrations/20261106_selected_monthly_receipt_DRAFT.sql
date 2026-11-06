-- DRAFT ONLY. Do not apply to production without isolated integration tests.
-- Atomic server-side issuance of selected monthly items.
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
  if not exists(select 1 from public.clients where id=p_client_id) then
    raise exception 'Client not found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_id::text || ':' || p_competence::text,0));
  if exists(select 1 from public.monthly_receipt_snapshots
            where client_id=p_client_id and competence_month=p_competence) then
    raise exception 'Monthly receipt already issued';
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
      if not found or v_charge.client_id<>p_client_id
         or v_charge.competence_month<>p_competence or v_charge.status<>'pending' then
        raise exception 'Package charge not eligible';
      end if;
      v_amount := v_charge.amount;
    elsif v_kind = 'appointment_extra' then
      select * into v_appointment from public.appointments where id=v_id for update;
      if not found or v_appointment.client_id<>p_client_id
         or v_appointment.status<>'completed' or v_appointment.deleted_at is not null
         or (v_appointment.starts_at at time zone 'America/Sao_Paulo')::date < p_competence
         or (v_appointment.starts_at at time zone 'America/Sao_Paulo')::date >= (p_competence + interval '1 month')::date
         or v_appointment.recurring_plan_id is not null
         or exists(select 1 from public.appointment_payments
                   where appointment_id=v_id and status='paid')
         or exists(select 1 from public.package_subscriptions s
                   where s.client_id=p_client_id and s.vehicle_id=v_appointment.vehicle_id
                     and s.service_id=v_appointment.service_id
                     and s.starts_on <= (v_appointment.starts_at at time zone 'America/Sao_Paulo')::date
                     and (s.superseded_at is null or (s.superseded_at at time zone 'America/Sao_Paulo')::date >= (v_appointment.starts_at at time zone 'America/Sao_Paulo')::date))
      then
        raise exception 'Appointment not eligible';
      end if;
      v_amount := v_appointment.final_value;
    else
      raise exception 'Unsupported item type';
    end if;
    if v_amount is null or v_amount <= 0
       or round(v_amount,2) <> v_amount
       or v_amount <> (v_item->>'amount')::numeric then
      raise exception 'Amount mismatch';
    end if;
    v_total := v_total + v_amount;
    v_verified_lines := v_verified_lines || jsonb_build_array(jsonb_build_object(
      'kind',v_kind,'id',v_id,'amount',v_amount
    ));
  end loop;
  insert into public.monthly_receipt_snapshots(client_id,competence_month,snapshot,issued_by)
  values(p_client_id,p_competence,jsonb_build_object(
    'schema_version',2,'kind','selected_monthly_receipt',
    'lines',v_verified_lines,'total',v_total,'item_count',v_count
  ),auth.uid()) returning id into v_doc;
  return v_doc;
end;
$$;
revoke all on function public.issue_selected_monthly_receipt(uuid,date,jsonb) from public;
grant execute on function public.issue_selected_monthly_receipt(uuid,date,jsonb) to authenticated;
