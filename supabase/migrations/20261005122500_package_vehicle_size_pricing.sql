-- Homologação isolada: porte P/M x G para precificação de pacotes.
-- Mantém services.price como preço-base/compatibilidade e usa price_pm/price_g nos pacotes.

alter table public.vehicles
  add column if not exists package_size text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicles_package_size_check'
      and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_package_size_check
      check (package_size is null or package_size in ('pm','g'));
  end if;
end $$;

alter table public.services
  add column if not exists size_pricing_enabled boolean not null default false,
  add column if not exists price_pm numeric,
  add column if not exists price_g numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'services_price_pm_check'
      and conrelid = 'public.services'::regclass
  ) then
    alter table public.services
      add constraint services_price_pm_check
      check (price_pm is null or price_pm >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'services_price_g_check'
      and conrelid = 'public.services'::regclass
  ) then
    alter table public.services
      add constraint services_price_g_check
      check (price_g is null or price_g >= 0);
  end if;
end $$;

-- Tabela de preços vigente definida para os pacotes.
update public.services
set
  price = 250,
  price_pm = 250,
  price_g = 250,
  size_pricing_enabled = true,
  updated_at = now()
where lower(btrim(name)) = 'pacote essencial';

update public.services
set
  price = 320,
  price_pm = 320,
  price_g = 340,
  size_pricing_enabled = true,
  updated_at = now()
where lower(btrim(name)) = 'pacote plus';

update public.services
set
  price = 390,
  price_pm = 390,
  price_g = 410,
  size_pricing_enabled = true,
  updated_at = now()
where lower(btrim(name)) = 'pacote premium';

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
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_role text;
  v_count integer;
  v_valid_count integer;
  v_service public.services%rowtype;
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

  select count(*)::integer
    into v_valid_count
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

  if not found then
    raise exception 'Serviço indisponível.';
  end if;

  select timezone into v_tz
  from public.schedule_settings
  where id=1;

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

    select v.package_size
      into v_package_size
    from public.vehicles v
    where v.id=v_vehicle;

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

    select coalesce(nullif(lower(btrim(x->>'frequency')),''),'once')
      into v_frequency
    from jsonb_array_elements(coalesce(p_recurrences,'[]'::jsonb)) x
    where nullif(x->>'vehicle_id','')::uuid=v_vehicle
    limit 1;

    v_frequency:=coalesce(v_frequency,'once');

    if v_frequency not in ('once','weekly','biweekly') then
      raise exception 'Frequência inválida para um dos veículos.';
    end if;

    for v_plan_id in
      select rp.id
      from public.recurring_plans rp
      where rp.vehicle_id=v_vehicle and rp.active
    loop
      update public.recurring_plans
         set active=false,updated_by=auth.uid(),updated_at=now()
       where id=v_plan_id;
    end loop;

    if v_frequency in ('weekly','biweekly') then
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
    'biweekly_count',v_biweekly
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
