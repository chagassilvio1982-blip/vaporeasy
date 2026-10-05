-- Vaporeasy Homologação Isolada
-- Pacotes: frequência quinzenal/semanal, limite mensal de 2/4 estéticas
-- e cobrança mensal criada no momento da contratação.

create table if not exists public.package_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  vehicle_id uuid not null references public.vehicles(id),
  service_id uuid not null references public.services(id),
  recurring_plan_id uuid not null unique references public.recurring_plans(id),
  frequency text not null check (frequency in ('weekly','biweekly')),
  visits_per_month smallint not null check (visits_per_month in (2,4)),
  package_units smallint not null check (package_units in (1,2)),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  monthly_amount numeric(12,2) not null check (monthly_amount >= 0),
  starts_on date not null,
  active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists package_subscriptions_one_active_vehicle
  on public.package_subscriptions(vehicle_id)
  where active;

create index if not exists package_subscriptions_client_idx
  on public.package_subscriptions(client_id,active);

create table if not exists public.package_charges (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.package_subscriptions(id),
  client_id uuid not null references public.clients(id),
  vehicle_id uuid not null references public.vehicles(id),
  service_id uuid not null references public.services(id),
  competence_month date not null,
  due_date date not null,
  frequency text not null check (frequency in ('weekly','biweekly')),
  visits_per_month smallint not null check (visits_per_month in (2,4)),
  package_units smallint not null check (package_units in (1,2)),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  payment_method text not null default '',
  paid_at timestamptz,
  notes text not null default '',
  confirmed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint package_charges_competence_first_day check (competence_month = date_trunc('month',competence_month)::date),
  constraint package_charges_subscription_month_unique unique(subscription_id,competence_month)
);

create index if not exists package_charges_competence_idx
  on public.package_charges(competence_month,status);

create index if not exists package_charges_paid_idx
  on public.package_charges(paid_at)
  where status='paid';

alter table public.package_subscriptions enable row level security;
alter table public.package_charges enable row level security;

drop policy if exists package_subscriptions_select on public.package_subscriptions;
create policy package_subscriptions_select
on public.package_subscriptions for select to authenticated
using (private.current_app_role() = any(array['owner'::text,'admin'::text]));

drop policy if exists package_subscriptions_write on public.package_subscriptions;
create policy package_subscriptions_write
on public.package_subscriptions for all to authenticated
using (private.current_app_role() = any(array['owner'::text,'admin'::text]))
with check (private.current_app_role() = any(array['owner'::text,'admin'::text]));

drop policy if exists package_charges_select on public.package_charges;
create policy package_charges_select
on public.package_charges for select to authenticated
using (private.current_app_role() = any(array['owner'::text,'admin'::text]));

drop policy if exists package_charges_write on public.package_charges;
create policy package_charges_write
on public.package_charges for all to authenticated
using (private.current_app_role() = any(array['owner'::text,'admin'::text]))
with check (private.current_app_role() = any(array['owner'::text,'admin'::text]));

drop trigger if exists package_subscriptions_touch_updated_at on public.package_subscriptions;
create trigger package_subscriptions_touch_updated_at
before update on public.package_subscriptions
for each row execute function private.touch_updated_at();

drop trigger if exists package_charges_touch_updated_at on public.package_charges;
create trigger package_charges_touch_updated_at
before update on public.package_charges
for each row execute function private.touch_updated_at();

create or replace function public.ensure_current_package_charges()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_role text;
  v_month date:=date_trunc('month',current_date)::date;
  v_count integer:=0;
begin
  v_role:=private.current_app_role();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception using errcode='42501',message='Seu perfil não pode gerar cobranças de pacotes.';
  end if;

  insert into public.package_charges(
    subscription_id,client_id,vehicle_id,service_id,
    competence_month,due_date,frequency,visits_per_month,package_units,
    unit_price,amount,status
  )
  select
    ps.id,ps.client_id,ps.vehicle_id,ps.service_id,
    v_month,current_date,ps.frequency,ps.visits_per_month,ps.package_units,
    ps.unit_price,ps.monthly_amount,'pending'
  from public.package_subscriptions ps
  where ps.active
    and ps.starts_on <= current_date
    and date_trunc('month',ps.starts_on)::date <= v_month
  on conflict(subscription_id,competence_month) do nothing;

  get diagnostics v_count=row_count;
  return v_count;
end
$function$;

create or replace function public.confirm_package_charge(
  p_charge_id uuid,
  p_payment_method text,
  p_notes text default ''::text
)
returns table(amount numeric,status text,paid_at timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_uid uuid;
  v_role text;
  v_method text;
  v_amount numeric;
  v_paid_at timestamptz;
begin
  v_uid:=auth.uid();
  if v_uid is null then raise exception 'Autenticação obrigatória.'; end if;
  v_role:=private.current_app_role();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'Seu perfil não pode confirmar pagamentos.';
  end if;
  v_method:=btrim(coalesce(p_payment_method,''));
  if v_method='' then raise exception 'Informe a forma de pagamento.'; end if;

  select pc.amount into v_amount
  from public.package_charges pc
  where pc.id=p_charge_id and pc.status<>'cancelled'
  for update;

  if not found then raise exception 'Cobrança de pacote não encontrada.'; end if;

  v_paid_at:=now();
  update public.package_charges
     set status='paid',
         payment_method=v_method,
         paid_at=v_paid_at,
         notes=coalesce(p_notes,''),
         confirmed_by=v_uid,
         updated_at=now()
   where id=p_charge_id;

  return query select v_amount,'paid'::text,v_paid_at;
end
$function$;

revoke all on function public.ensure_current_package_charges() from public,anon;
grant execute on function public.ensure_current_package_charges() to authenticated;
revoke all on function public.confirm_package_charge(uuid,text,text) from public,anon;
grant execute on function public.confirm_package_charge(uuid,text,text) to authenticated;

create or replace function private.ensure_payment_after_completion()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
begin
  if new.status='completed' and old.status is distinct from new.status then
    -- Atendimentos pertencentes a pacote são pagos pela cobrança mensal,
    -- não individualmente por visita.
    if new.recurring_plan_id is not null
       and exists(
         select 1
         from public.package_subscriptions ps
         where ps.recurring_plan_id=new.recurring_plan_id
       ) then
      delete from public.appointment_payments
       where appointment_id=new.id
         and status<>'paid';
      return new;
    end if;

    insert into public.appointment_payments(appointment_id,status,amount)
    values(new.id,'pending',new.final_value)
    on conflict(appointment_id) do update
      set amount=excluded.amount,
          updated_at=now();
  end if;
  return new;
end
$function$;

create or replace function private.materialize_recurring_plan(p_plan_id uuid,p_through date)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  p public.recurring_plans%rowtype;
  s public.services%rowtype;
  tz text;
  d date;
  n integer:=0;
  created_count integer:=0;
  conflict_count integer:=0;
  appt_start timestamptz;
  idem text;
  v_month_cap integer;
  v_month_count integer;
begin
  select * into p
  from public.recurring_plans
  where id=p_plan_id and active;

  if not found then
    return jsonb_build_object('created',0,'conflicts',0);
  end if;

  select * into s
  from public.services
  where id=p.service_id and active;

  if not found then
    return jsonb_build_object('created',0,'conflicts',0);
  end if;

  select timezone into tz
  from public.schedule_settings
  where id=1;
  if tz is null then tz:='America/Sao_Paulo'; end if;

  select ps.visits_per_month
    into v_month_cap
  from public.package_subscriptions ps
  where ps.recurring_plan_id=p.id
  limit 1;

  loop
    if p.frequency='weekly' then
      d:=p.start_date+(n*7);
    elsif p.frequency='biweekly' then
      d:=p.start_date+(n*14);
    else
      d:=(p.start_date+make_interval(months=>n))::date;
    end if;

    exit when d>p_through;

    if d>=p.start_date then
      idem:='recurrence:'||p.id::text||':'||d::text;

      if v_month_cap is not null then
        select count(*)::integer
          into v_month_count
        from public.appointments a
        where a.recurring_plan_id=p.id
          and a.source='recurrence'
          and a.deleted_at is null
          and a.status<>'cancelled'
          and date_trunc('month',(a.starts_at at time zone tz)::date)
              = date_trunc('month',d);
      else
        v_month_count:=0;
      end if;

      if (v_month_cap is null or v_month_count<v_month_cap)
         and not exists(
           select 1 from public.appointments a
           where a.idempotency_key=idem
         ) then
        appt_start:=((d+p.local_time) at time zone tz);
        begin
          insert into public.appointments(
            client_id,vehicle_id,service_id,team_id,collaborator_id,
            recurring_plan_id,starts_at,duration_minutes,status,source,
            base_value,discount_percent,discount_amount,final_value,
            notes,idempotency_key,created_by,updated_by
          )
          values(
            p.client_id,p.vehicle_id,p.service_id,p.team_id,p.collaborator_id,
            p.id,appt_start,s.duration_minutes,'scheduled','recurrence',
            p.base_value,p.discount_percent,0,p.final_value,
            p.notes,idem,p.created_by,p.updated_by
          );
          created_count:=created_count+1;
        exception
          when exclusion_violation or unique_violation or check_violation or raise_exception then
            conflict_count:=conflict_count+1;
        end;
      end if;
    end if;

    n:=n+1;
    exit when n>500;
  end loop;

  return jsonb_build_object('created',created_count,'conflicts',conflict_count);
end
$function$;

create or replace function public.create_multi_vehicle_booking_recurring(
  p_client_id uuid,
  p_vehicle_ids uuid[],
  p_service_id uuid,
  p_date date,
  p_local_time time without time zone,
  p_recurrences jsonb default '[]'::jsonb,
  p_team_id uuid default null::uuid,
  p_collaborator_id uuid default null::uuid,
  p_notes text default ''::text,
  p_idempotency_key text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_role text;
  v_count integer;
  v_valid_count integer;
  v_service public.services%rowtype;
  v_is_package boolean;
  v_group uuid:=gen_random_uuid();
  v_tz text;
  v_first_start timestamptz;
  v_start timestamptz;
  v_vehicle uuid;
  v_i integer;
  v_id uuid;
  v_ids uuid[]:='{}'::uuid[];
  v_slot_ok boolean;
  v_key text;
  v_frequency text;
  v_plan_id uuid;
  v_local_time time;
  v_plan_count integer:=0;
  v_weekly integer:=0;
  v_biweekly integer:=0;
  v_package_size text;
  v_price numeric;
  v_package_units smallint;
  v_visits smallint;
  v_monthly numeric;
  v_subscription_id uuid;
  v_charge_id uuid;
  v_billing jsonb:='[]'::jsonb;
begin
  v_role:=private.current_app_role();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception using errcode='42501',message='Seu perfil não pode criar agendamentos.';
  end if;

  if p_team_id is not null and p_collaborator_id is not null then
    raise exception 'Selecione equipe ou colaborador, não os dois.';
  end if;

  v_count:=coalesce(cardinality(p_vehicle_ids),0);
  if v_count<1 or v_count>20 then
    raise exception 'Selecione de 1 a 20 veículos.';
  end if;

  if (select count(distinct x) from unnest(p_vehicle_ids) x)<>v_count then
    raise exception 'Há veículos repetidos na seleção.';
  end if;

  select count(*)::integer into v_valid_count
  from public.vehicles v
  where v.id=any(p_vehicle_ids)
    and v.client_id=p_client_id
    and v.archived_at is null;

  if v_valid_count<>v_count then
    raise exception 'Um dos veículos selecionados não pertence a este cliente ou está inativo.';
  end if;

  select * into v_service
  from public.services
  where id=p_service_id and active;

  if not found then raise exception 'Serviço indisponível.'; end if;

  v_is_package:=lower(btrim(coalesce(v_service.category,''))) like 'pacote%';

  select timezone into v_tz from public.schedule_settings where id=1;
  if v_tz is null then v_tz:='America/Sao_Paulo'; end if;
  v_first_start:=((p_date+p_local_time) at time zone v_tz);

  select exists(
    select 1
    from public.get_multi_vehicle_slots(
      p_date,p_service_id,p_vehicle_ids,p_collaborator_id,p_team_id
    ) s
    where s.starts_at=v_first_start
  ) into v_slot_ok;

  if not coalesce(v_slot_ok,false) then
    raise exception 'Esse bloco de horário não está mais disponível para todos os veículos selecionados.';
  end if;

  v_key:=coalesce(nullif(btrim(p_idempotency_key),''),gen_random_uuid()::text);

  for v_i in 1..v_count loop
    v_vehicle:=p_vehicle_ids[v_i];
    v_start:=v_first_start+make_interval(mins=>v_service.duration_minutes*(v_i-1));
    v_local_time:=(v_start at time zone v_tz)::time;

    select v.package_size into v_package_size
    from public.vehicles v where v.id=v_vehicle;

    if v_service.size_pricing_enabled then
      if v_package_size is null or v_package_size not in ('pm','g') then
        raise exception 'Defina o porte P/M ou G do veículo antes de agendar este pacote.';
      end if;
      v_price:=case
        when v_package_size='g' then coalesce(v_service.price_g,v_service.price)
        else coalesce(v_service.price_pm,v_service.price)
      end;
    else
      v_price:=v_service.price;
    end if;

    select lower(nullif(btrim(x->>'frequency'),''))
      into v_frequency
    from jsonb_array_elements(coalesce(p_recurrences,'[]'::jsonb)) x
    where nullif(x->>'vehicle_id','')::uuid=v_vehicle
    limit 1;

    if v_is_package then
      if v_frequency not in ('weekly','biweekly') then
        raise exception 'Para pacote, escolha Quinzenal ou Semanal.';
      end if;
    else
      v_frequency:=coalesce(v_frequency,'once');
      if v_frequency not in ('once','weekly','biweekly') then
        raise exception 'Frequência inválida para um dos veículos.';
      end if;
    end if;

    for v_plan_id in
      select rp.id
      from public.recurring_plans rp
      where rp.vehicle_id=v_vehicle and rp.active
    loop
      update public.package_subscriptions
         set active=false,updated_by=auth.uid(),updated_at=now()
       where recurring_plan_id=v_plan_id and active;

      update public.recurring_plans
         set active=false,updated_by=auth.uid(),updated_at=now()
       where id=v_plan_id;
    end loop;

    if v_frequency in ('weekly','biweekly') then
      if v_is_package then
        v_package_units:=case when v_frequency='weekly' then 2 else 1 end;
        v_visits:=case when v_frequency='weekly' then 4 else 2 end;
        v_monthly:=round(v_price*v_package_units,2);

        insert into public.recurring_plans(
          client_id,vehicle_id,service_id,frequency,weekday,local_time,start_date,
          base_value,discount_percent,final_value,notes,active,
          team_id,collaborator_id,created_by,updated_by
        )
        values(
          p_client_id,v_vehicle,p_service_id,v_frequency,
          extract(dow from p_date)::smallint,v_local_time,p_date,
          v_price,0,v_price,coalesce(p_notes,''),false,
          p_team_id,p_collaborator_id,auth.uid(),auth.uid()
        )
        returning id into v_plan_id;

        insert into public.package_subscriptions(
          client_id,vehicle_id,service_id,recurring_plan_id,
          frequency,visits_per_month,package_units,unit_price,monthly_amount,
          starts_on,active,created_by,updated_by
        )
        values(
          p_client_id,v_vehicle,p_service_id,v_plan_id,
          v_frequency,v_visits,v_package_units,v_price,v_monthly,
          p_date,true,auth.uid(),auth.uid()
        )
        returning id into v_subscription_id;

        insert into public.package_charges(
          subscription_id,client_id,vehicle_id,service_id,
          competence_month,due_date,frequency,visits_per_month,package_units,
          unit_price,amount,status
        )
        values(
          v_subscription_id,p_client_id,v_vehicle,p_service_id,
          date_trunc('month',p_date)::date,current_date,v_frequency,v_visits,v_package_units,
          v_price,v_monthly,'pending'
        )
        on conflict(subscription_id,competence_month) do update
          set amount=excluded.amount,
              unit_price=excluded.unit_price,
              visits_per_month=excluded.visits_per_month,
              package_units=excluded.package_units,
              frequency=excluded.frequency,
              updated_at=now()
        returning id into v_charge_id;

        update public.recurring_plans
           set active=true,updated_by=auth.uid(),updated_at=now()
         where id=v_plan_id;

        v_billing:=v_billing||jsonb_build_array(jsonb_build_object(
          'vehicle_id',v_vehicle,
          'subscription_id',v_subscription_id,
          'charge_id',v_charge_id,
          'frequency',v_frequency,
          'visits_per_month',v_visits,
          'package_units',v_package_units,
          'unit_price',v_price,
          'monthly_amount',v_monthly
        ));
      else
        insert into public.recurring_plans(
          client_id,vehicle_id,service_id,frequency,weekday,local_time,start_date,
          base_value,discount_percent,final_value,notes,active,
          team_id,collaborator_id,created_by,updated_by
        )
        values(
          p_client_id,v_vehicle,p_service_id,v_frequency,
          extract(dow from p_date)::smallint,v_local_time,p_date,
          v_price,0,v_price,coalesce(p_notes,''),true,
          p_team_id,p_collaborator_id,auth.uid(),auth.uid()
        )
        returning id into v_plan_id;
      end if;

      select a.id into v_id
      from public.appointments a
      where a.recurring_plan_id=v_plan_id
        and a.idempotency_key='recurrence:'||v_plan_id::text||':'||p_date::text
      limit 1;

      if v_id is null then
        raise exception 'Não foi possível criar o primeiro atendimento recorrente.';
      end if;

      v_plan_count:=v_plan_count+1;
      if v_frequency='weekly' then v_weekly:=v_weekly+1; end if;
      if v_frequency='biweekly' then v_biweekly:=v_biweekly+1; end if;
    else
      insert into public.appointments(
        booking_group_id,booking_item_index,
        client_id,vehicle_id,service_id,team_id,collaborator_id,
        starts_at,duration_minutes,status,source,
        base_value,discount_percent,discount_amount,final_value,
        notes,idempotency_key,created_by,updated_by
      )
      values(
        v_group,v_i-1,
        p_client_id,v_vehicle,p_service_id,p_team_id,p_collaborator_id,
        v_start,v_service.duration_minutes,'scheduled','internal',
        v_price,0,0,v_price,
        coalesce(p_notes,''),
        'internal-batch:'||auth.uid()::text||':'||v_key||':'||(v_i-1)::text,
        auth.uid(),auth.uid()
      )
      returning id into v_id;
    end if;

    v_ids:=array_append(v_ids,v_id);
  end loop;

  return jsonb_build_object(
    'booking_group_id',v_group,
    'appointment_ids',to_jsonb(v_ids),
    'count',v_count,
    'recurring_count',v_plan_count,
    'weekly_count',v_weekly,
    'biweekly_count',v_biweekly,
    'package_billing',v_billing
  );
exception
  when exclusion_violation or unique_violation then
    raise exception using errcode='P0001',
      message='Um dos veículos, a equipe ou o colaborador ficou ocupado nesse horário. Atualize os horários e tente novamente.';
  when check_violation or not_null_violation or foreign_key_violation then
    raise exception using errcode='P0001',
      message='Não foi possível criar o agendamento múltiplo. Revise cliente, veículos, serviço, frequência e responsável.';
end
$function$;
