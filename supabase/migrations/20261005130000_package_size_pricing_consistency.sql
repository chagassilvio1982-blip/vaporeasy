-- Mantém a precificação P/M x G consistente em agendamento público
-- e em registro retroativo de serviços realizados.

create or replace function private.create_public_booking(
  p_client_id uuid,
  p_vehicle_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_status text,
  p_notes text,
  p_idempotency_key text,
  p_addon_ids uuid[] default null::uuid[]
)
returns table(id uuid,status text,starts_at timestamptz,final_value numeric,duration_minutes integer)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_service public.services%rowtype;
  v_ids uuid[];
  v_selected_count integer;
  v_valid_count integer;
  v_addon_value numeric(10,2);
  v_addon_duration integer;
  v_appt public.appointments%rowtype;
  v_package_size text;
  v_base_price numeric(10,2);
begin
  select s.* into v_service
  from public.services s
  where s.id=p_service_id and s.active;

  if v_service.id is null then
    raise exception using errcode='P0001',message='Serviço indisponível.';
  end if;

  select v.package_size into v_package_size
  from public.vehicles v
  where v.id=p_vehicle_id and v.client_id=p_client_id and v.archived_at is null;

  if not found then
    raise exception using errcode='P0001',message='Veículo não encontrado ou indisponível.';
  end if;

  if v_service.size_pricing_enabled then
    if v_package_size is null or v_package_size not in ('pm','g') then
      raise exception using errcode='P0001',
        message='Selecione o porte P/M ou G do veículo para este pacote.';
    end if;
    v_base_price:=case
      when v_package_size='g' then coalesce(v_service.price_g,v_service.price)
      else coalesce(v_service.price_pm,v_service.price)
    end;
  else
    v_base_price:=v_service.price;
  end if;

  select coalesce(array_agg(distinct u.x),'{}'::uuid[])
    into v_ids
  from unnest(coalesce(p_addon_ids,'{}'::uuid[])) as u(x);

  v_selected_count:=coalesce(array_length(v_ids,1),0);

  select count(*)::integer,
         coalesce(sum(a.price),0)::numeric(10,2),
         coalesce(sum(a.duration_minutes),0)::integer
    into v_valid_count,v_addon_value,v_addon_duration
  from public.service_addons a
  where a.active and a.public_enabled and a.id=any(v_ids);

  if v_valid_count<>v_selected_count then
    raise exception using errcode='P0001',
      message='Um dos serviços extras selecionados não está disponível.';
  end if;

  if exists(
    select 1
    from public.service_addon_rules r
    where r.relation='excludes'
      and r.addon_id=any(v_ids)
      and r.related_addon_id=any(v_ids)
  ) then
    raise exception using errcode='P0001',
      message='A Hidratação dos bancos/couro já inclui a Limpeza técnica dos bancos. Escolha apenas a Hidratação.';
  end if;

  insert into public.appointments(
    client_id,vehicle_id,service_id,collaborator_id,
    starts_at,duration_minutes,addon_duration_minutes,
    status,source,base_value,addon_value,final_value,
    notes,idempotency_key
  )
  values(
    p_client_id,p_vehicle_id,p_service_id,null,
    p_starts_at,v_service.duration_minutes,v_addon_duration,
    p_status,'public',v_base_price,v_addon_value,
    v_base_price+v_addon_value,
    p_notes,p_idempotency_key
  )
  returning * into v_appt;

  insert into public.appointment_addons(
    appointment_id,addon_id,addon_name,unit_price,duration_minutes,quantity
  )
  select
    v_appt.id,a.id,a.name,a.price,a.duration_minutes,1
  from public.service_addons a
  where a.id=any(v_ids)
  order by a.sort_order,a.name;

  id:=v_appt.id;
  status:=v_appt.status;
  starts_at:=v_appt.starts_at;
  final_value:=v_appt.final_value;
  duration_minutes:=v_appt.duration_minutes;
  return next;
end
$function$;

create or replace function public.register_completed_services(
  p_client_id uuid,
  p_vehicle_ids uuid[],
  p_service_id uuid,
  p_date date,
  p_local_time time without time zone,
  p_team_id uuid default null::uuid,
  p_collaborator_id uuid default null::uuid,
  p_notes text default ''::text,
  p_base_value numeric default null::numeric,
  p_discount_type text default 'none'::text,
  p_discount_value numeric default 0,
  p_idempotency_key text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_role text;
  v_tz text;
  v_service public.services%rowtype;
  v_base numeric;
  v_discount numeric;
  v_percent numeric;
  v_final numeric;
  v_group uuid := gen_random_uuid();
  v_vehicle uuid;
  v_package_size text;
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_actor_name text;
  v_item_key text;
  v_count integer;
  v_existing_count integer;
  v_i integer := 0;
  v_finals jsonb := '[]'::jsonb;
begin
  v_role := private.current_app_role();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception using errcode='42501',message='Seu perfil não pode registrar serviços realizados.';
  end if;
  if p_client_id is null or p_service_id is null or p_date is null or p_local_time is null then
    raise exception 'Cliente, serviço, data e horário são obrigatórios.';
  end if;
  if p_team_id is not null and p_collaborator_id is not null then
    raise exception 'Selecione equipe ou colaborador, não os dois.';
  end if;

  v_count := coalesce(cardinality(p_vehicle_ids),0);
  if v_count < 1 or v_count > 20 then raise exception 'Selecione entre 1 e 20 veículos.'; end if;
  if (select count(distinct x) from unnest(p_vehicle_ids) x) <> v_count then
    raise exception 'A lista de veículos contém duplicidade.';
  end if;
  if not exists(select 1 from public.clients c where c.id=p_client_id and c.archived_at is null) then
    raise exception 'Cliente não encontrado ou excluído.';
  end if;

  select s.* into v_service
  from public.services s
  where s.id=p_service_id and s.active;
  if v_service.id is null or v_service.duration_minutes <= 0 then
    raise exception 'Serviço inválido ou inativo.';
  end if;

  select timezone into v_tz from public.schedule_settings where id=1;
  v_tz := coalesce(v_tz,'America/Sao_Paulo');

  if p_team_id is not null and not exists(select 1 from public.teams t where t.id=p_team_id and t.active) then
    raise exception 'Equipe inválida ou inativa.';
  end if;
  if p_collaborator_id is not null and not exists(select 1 from public.collaborators c where c.id=p_collaborator_id and c.active) then
    raise exception 'Colaborador inválido ou inativo.';
  end if;

  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is not null then
    select count(*) into v_existing_count
    from public.appointments a
    where a.idempotency_key like 'retroactive:'||p_idempotency_key||':%';
    if v_existing_count > 0 then
      if v_existing_count <> v_count then
        raise exception 'Registro retroativo parcialmente processado. Atualize a agenda antes de tentar novamente.';
      end if;
      select array_agg(a.id order by a.booking_item_index) into v_ids
      from public.appointments a
      where a.idempotency_key like 'retroactive:'||p_idempotency_key||':%';
      return jsonb_build_object(
        'appointment_ids',to_jsonb(v_ids),
        'count',v_existing_count,
        'reused',true
      );
    end if;
  end if;

  select p.name into v_actor_name from public.app_profiles p where p.user_id=auth.uid();

  foreach v_vehicle in array p_vehicle_ids loop
    select v.package_size into v_package_size
    from public.vehicles v
    where v.id=v_vehicle and v.client_id=p_client_id and v.archived_at is null;

    if not found then
      raise exception 'Um dos veículos não pertence ao cliente ou foi excluído.';
    end if;

    if p_base_value is not null then
      v_base := round(greatest(0,p_base_value)::numeric,2);
    elsif v_service.size_pricing_enabled then
      if v_package_size is null or v_package_size not in ('pm','g') then
        raise exception 'Defina o porte P/M ou G de todos os veículos antes de registrar este pacote.';
      end if;
      v_base := round((case
        when v_package_size='g' then coalesce(v_service.price_g,v_service.price)
        else coalesce(v_service.price_pm,v_service.price)
      end)::numeric,2);
    else
      v_base := round(greatest(0,coalesce(v_service.price,0))::numeric,2);
    end if;

    if coalesce(p_discount_type,'none')='percent' then
      if coalesce(p_discount_value,0) < 0 or coalesce(p_discount_value,0) > 100 then
        raise exception 'Percentual de desconto inválido.';
      end if;
      v_percent := round(coalesce(p_discount_value,0)::numeric,2);
      v_discount := round(v_base*v_percent/100,2);
    elsif coalesce(p_discount_type,'none')='fixed' then
      if coalesce(p_discount_value,0) < 0 or coalesce(p_discount_value,0) > v_base then
        raise exception 'Valor de desconto inválido para um dos veículos.';
      end if;
      v_discount := round(coalesce(p_discount_value,0)::numeric,2);
      v_percent := case when v_base>0 then round(v_discount/v_base*100,2) else 0 end;
    elsif coalesce(p_discount_type,'none')='none' then
      v_discount := 0;
      v_percent := 0;
    else
      raise exception 'Tipo de desconto inválido.';
    end if;
    v_final := round(greatest(0,v_base-v_discount),2);

    v_start := ((p_date+p_local_time) at time zone v_tz) + make_interval(mins=>v_service.duration_minutes*v_i);
    v_end := v_start + make_interval(mins=>v_service.duration_minutes);
    if v_end > clock_timestamp() then
      raise exception 'Serviço realizado precisa ter data e horário já concluídos.';
    end if;

    v_item_key := case
      when nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then null
      else 'retroactive:'||p_idempotency_key||':'||v_vehicle::text
    end;

    insert into public.appointments(
      booking_group_id,booking_item_index,client_id,vehicle_id,service_id,team_id,collaborator_id,
      starts_at,duration_minutes,status,source,base_value,addon_value,discount_amount,discount_percent,
      final_value,notes,idempotency_key,created_by,updated_by
    ) values(
      v_group,v_i,p_client_id,v_vehicle,p_service_id,p_team_id,p_collaborator_id,
      v_start,v_service.duration_minutes,'scheduled','retroactive',v_base,0,v_discount,v_percent,
      v_final,btrim(coalesce(p_notes,'')),v_item_key,auth.uid(),auth.uid()
    )
    returning id into v_id;

    insert into public.appointment_completion_exceptions(
      appointment_id,reason,recorded_by,recorded_by_name,collaborator_id,recorded_at,updated_at
    ) values(
      v_id,'Serviço realizado registrado retroativamente pela gestão.',auth.uid(),
      coalesce(v_actor_name,'Gestão Vaporeasy'),p_collaborator_id,clock_timestamp(),clock_timestamp()
    );

    update public.appointments
      set status='in_progress',updated_by=auth.uid(),updated_at=now()
      where id=v_id;
    update public.appointments
      set status='completed',completed_at=v_end,updated_by=auth.uid(),updated_at=now()
      where id=v_id;

    v_ids := array_append(v_ids,v_id);
    v_finals := v_finals || jsonb_build_array(jsonb_build_object(
      'vehicle_id',v_vehicle,
      'base_value',v_base,
      'final_value',v_final
    ));
    v_i := v_i+1;
  end loop;

  return jsonb_build_object(
    'appointment_ids',to_jsonb(v_ids),
    'count',cardinality(v_ids),
    'final_values',v_finals,
    'reused',false
  );
end
$function$;
