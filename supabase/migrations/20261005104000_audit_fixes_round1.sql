create or replace function private.v2_photo_write_allowed(p_path text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  a public.appointments;
  actor uuid := auth.uid();
  role_name text := private.current_app_role();
begin
  if actor is null or coalesce(role_name,'') not in ('owner','admin','operator') then return false; end if;
  if split_part(p_path,'/',2) <> actor::text
     or split_part(p_path,'/',3) <> 'final.jpg'
     or array_length(string_to_array(p_path,'/'),1) <> 3 then return false; end if;
  begin
    select * into a from public.appointments
    where id = split_part(p_path,'/',1)::uuid for update;
  exception when invalid_text_representation then return false; end;
  if a.id is null or a.deleted_at is not null or a.status in ('cancelled','no_show') then return false; end if;
  if role_name in ('owner','admin') then return true; end if;
  if a.status = 'completed' then return false; end if;
  return exists(
    select 1 from public.collaborators c
    where c.user_id = actor and c.active
      and (
        c.id = a.collaborator_id
        or exists(
          select 1 from public.team_members tm
          where tm.team_id = a.team_id and tm.collaborator_id = c.id
        )
      )
  );
end
$$;

create or replace function private.notify_public_booking()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_client text; v_vehicle text; v_service text; v_booking_mode text;
  v_when text; v_title text; v_message text;
begin
  if new.source <> 'public' then return new; end if;
  select c.name into v_client from public.clients c where c.id = new.client_id;
  select concat_ws(' ',v.brand,v.model) into v_vehicle from public.vehicles v where v.id = new.vehicle_id;
  select s.name,s.booking_mode into v_service,v_booking_mode from public.services s where s.id = new.service_id;
  v_when := to_char(new.starts_at at time zone 'America/Sao_Paulo','DD/MM/YYYY "às" HH24:MI');
  if v_booking_mode = 'request' then
    v_title := 'Nova solicitação de agendamento';
    v_message := concat_ws(' • ',coalesce(v_client,'Cliente'),coalesce(v_vehicle,'Veículo'),coalesce(v_service,'Serviço'),v_when,'Aguardando confirmação');
  else
    v_title := 'Novo agendamento público';
    v_message := concat_ws(' • ',coalesce(v_client,'Cliente'),coalesce(v_vehicle,'Veículo'),coalesce(v_service,'Serviço'),v_when);
  end if;
  insert into public.app_notifications(user_id,appointment_id,type,title,message)
  select p.user_id,new.id,'public_booking',v_title,v_message
  from public.app_profiles p
  where p.active and p.role in ('owner','admin');
  return new;
end
$$;

create or replace function private.guard_vehicle_archive()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    if exists(
      select 1 from public.appointments a
      where a.vehicle_id = old.id
        and a.deleted_at is null
        and a.status not in ('completed','cancelled','no_show')
        and a.starts_at >= now()
    ) then
      raise exception using errcode='P0001',
        message='Este veículo possui agendamento futuro ativo. Cancele ou remaneje o agendamento antes de excluir o veículo.';
    end if;
    update public.recurring_plans
       set active=false,updated_by=coalesce(auth.uid(),updated_by),updated_at=now()
     where vehicle_id=old.id and active=true;
  end if;
  return new;
end
$$;

drop trigger if exists vehicles_guard_archive on public.vehicles;
create trigger vehicles_guard_archive
before update of archived_at on public.vehicles
for each row execute function private.guard_vehicle_archive();

create or replace function private.guard_client_archive()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    if exists(
      select 1 from public.appointments a
      where a.client_id = old.id
        and a.deleted_at is null
        and a.status not in ('completed','cancelled','no_show')
        and a.starts_at >= now()
    ) then
      raise exception using errcode='P0001',
        message='Este cliente possui agendamento futuro ativo. Cancele ou remaneje o agendamento antes de excluir o cadastro.';
    end if;
    update public.vehicles
       set archived_at=new.archived_at
     where client_id=old.id and archived_at is null;
  end if;
  return new;
end
$$;

drop trigger if exists clients_guard_archive on public.clients;
create trigger clients_guard_archive
before update of archived_at on public.clients
for each row execute function private.guard_client_archive();

create or replace function public.archive_client_safe(p_client_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare v_role text; v_changed integer;
begin
  v_role := private.current_app_role();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception using errcode='42501',message='Seu perfil não pode excluir clientes.';
  end if;
  update public.clients
     set archived_at=now(),updated_by=auth.uid(),updated_at=now()
   where id=p_client_id and archived_at is null;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception using errcode='P0001',message='Cliente não encontrado ou já excluído.';
  end if;
  return true;
end
$$;

revoke all on function public.archive_client_safe(uuid) from public,anon;
grant execute on function public.archive_client_safe(uuid) to authenticated;

create or replace function private.v2_guard_appointment()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_gross numeric; v_expected_percent numeric; v_role text;
begin
  if TG_OP='INSERT' then
    if new.status not in ('requested','scheduled') or new.completed_at is not null
       or new.cancelled_at is not null or new.deleted_at is not null then
      raise exception using errcode='42501',message='Novo atendimento deve iniciar como solicitado ou agendado.';
    end if;
  else
    if old.status in ('completed','cancelled','no_show') then
      if old.status='completed' then
        if (to_jsonb(new)-'updated_at'-'updated_by'-'discount_amount'-'discount_percent'-'final_value') is distinct from
           (to_jsonb(old)-'updated_at'-'updated_by'-'discount_amount'-'discount_percent'-'final_value') then
          raise exception using errcode='42501',message='Atendimento encerrado não pode ser reaberto ou reescrito.';
        end if;
        v_gross := greatest(0,coalesce(old.base_value,0)+coalesce(old.addon_value,0));
        if coalesce(new.discount_amount,0) < 0 or coalesce(new.discount_amount,0) > v_gross then
          raise exception using errcode='42501',message='Desconto inválido para atendimento concluído.';
        end if;
        if round(coalesce(new.final_value,0),2) <> round(greatest(0,v_gross-coalesce(new.discount_amount,0)),2) then
          raise exception using errcode='42501',message='Valor final inconsistente com o desconto informado.';
        end if;
        v_expected_percent := case when v_gross > 0 then round(coalesce(new.discount_amount,0)/v_gross*100,2) else 0 end;
        if round(coalesce(new.discount_percent,0),2) <> v_expected_percent then
          raise exception using errcode='42501',message='Percentual de desconto inconsistente.';
        end if;
      else
        if (to_jsonb(new)-'updated_at'-'updated_by') is distinct from
           (to_jsonb(old)-'updated_at'-'updated_by') then
          raise exception using errcode='42501',message='Atendimento encerrado não pode ser reaberto ou reescrito.';
        end if;
      end if;
    end if;

    if new.status is distinct from old.status and not (
      (old.status='requested' and new.status in ('confirmed','cancelled')) or
      (old.status='scheduled' and new.status in ('confirmed','in_progress','cancelled','no_show')) or
      (old.status='confirmed' and new.status in ('in_progress','cancelled','no_show')) or
      (old.status='in_progress' and new.status in ('completed','cancelled'))
    ) then
      raise exception using errcode='42501',message='Transição de atendimento não permitida.';
    end if;

    if new.status='completed' and old.status<>'completed' then
      if not exists(
        select 1 from public.appointment_completion_photos p
        join storage.objects o on o.bucket_id='completion-photos' and o.name=p.storage_path
        where p.appointment_id=new.id
      )
      and not exists(
        select 1 from public.appointment_completion_exceptions e
        where e.appointment_id=new.id and length(btrim(e.reason)) >= 10
      ) then
        raise exception using errcode='42501',
          message='Registre uma foto final válida ou uma justificativa de exceção antes de concluir.';
      end if;

      v_role := private.current_app_role();
      if new.source='retroactive' and v_role in ('owner','admin') then
        if new.completed_at is null then
          new.completed_at := least(coalesce(new.ends_at,clock_timestamp()),clock_timestamp());
        elsif new.completed_at > clock_timestamp() then
          raise exception using errcode='42501',message='Horário de conclusão retroativa não pode estar no futuro.';
        end if;
      else
        new.completed_at := clock_timestamp();
      end if;
    elsif new.completed_at is distinct from old.completed_at then
      raise exception using errcode='42501',message='Horário de conclusão é registrado pelo servidor.';
    end if;

    if new.status='cancelled' and old.status<>'cancelled' then
      new.cancelled_at:=clock_timestamp();
    elsif new.cancelled_at is distinct from old.cancelled_at then
      raise exception using errcode='42501',message='Horário de cancelamento é registrado pelo servidor.';
    end if;
  end if;

  if auth.uid() is not null then new.updated_by:=auth.uid(); end if;
  return new;
end
$$;

create or replace function public.register_completed_services(
  p_client_id uuid,
  p_vehicle_ids uuid[],
  p_service_id uuid,
  p_date date,
  p_local_time time without time zone,
  p_team_id uuid default null,
  p_collaborator_id uuid default null,
  p_notes text default '',
  p_base_value numeric default null,
  p_discount_type text default 'none',
  p_discount_value numeric default 0,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  v_role text; v_tz text; v_duration integer; v_service_price numeric;
  v_base numeric; v_discount numeric; v_percent numeric; v_final numeric;
  v_group uuid := gen_random_uuid(); v_vehicle uuid; v_start timestamptz; v_end timestamptz;
  v_id uuid; v_ids uuid[] := '{}'; v_actor_name text; v_item_key text;
  v_count integer; v_existing_count integer; v_i integer := 0;
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

  select s.duration_minutes,s.price into v_duration,v_service_price
  from public.services s where s.id=p_service_id and s.active;
  if v_duration is null or v_duration <= 0 then raise exception 'Serviço inválido ou inativo.'; end if;

  select timezone into v_tz from public.schedule_settings where id=1;
  v_tz := coalesce(v_tz,'America/Sao_Paulo');
  v_base := round(greatest(0,coalesce(p_base_value,v_service_price,0))::numeric,2);

  if coalesce(p_discount_type,'none')='percent' then
    if coalesce(p_discount_value,0) < 0 or coalesce(p_discount_value,0) > 100 then raise exception 'Percentual de desconto inválido.'; end if;
    v_percent := round(coalesce(p_discount_value,0)::numeric,2);
    v_discount := round(v_base*v_percent/100,2);
  elsif coalesce(p_discount_type,'none')='fixed' then
    if coalesce(p_discount_value,0) < 0 or coalesce(p_discount_value,0) > v_base then raise exception 'Valor de desconto inválido.'; end if;
    v_discount := round(coalesce(p_discount_value,0)::numeric,2);
    v_percent := case when v_base>0 then round(v_discount/v_base*100,2) else 0 end;
  elsif coalesce(p_discount_type,'none')='none' then
    v_discount := 0; v_percent := 0;
  else
    raise exception 'Tipo de desconto inválido.';
  end if;
  v_final := round(greatest(0,v_base-v_discount),2);

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
      return jsonb_build_object('appointment_ids',to_jsonb(v_ids),'count',v_existing_count,'final_value_each',v_final,'reused',true);
    end if;
  end if;

  select p.name into v_actor_name from public.app_profiles p where p.user_id=auth.uid();

  foreach v_vehicle in array p_vehicle_ids loop
    if not exists(
      select 1 from public.vehicles v
      where v.id=v_vehicle and v.client_id=p_client_id and v.archived_at is null
    ) then
      raise exception 'Um dos veículos não pertence ao cliente ou foi excluído.';
    end if;

    v_start := ((p_date+p_local_time) at time zone v_tz) + make_interval(mins=>v_duration*v_i);
    v_end := v_start + make_interval(mins=>v_duration);
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
      v_start,v_duration,'scheduled','retroactive',v_base,0,v_discount,v_percent,
      v_final,btrim(coalesce(p_notes,'')),v_item_key,auth.uid(),auth.uid()
    )
    returning id into v_id;

    insert into public.appointment_completion_exceptions(
      appointment_id,reason,recorded_by,recorded_by_name,collaborator_id,recorded_at,updated_at
    ) values(
      v_id,'Serviço realizado registrado retroativamente pela gestão.',auth.uid(),
      coalesce(v_actor_name,'Gestão Vaporeasy'),p_collaborator_id,clock_timestamp(),clock_timestamp()
    );

    update public.appointments set status='in_progress',updated_by=auth.uid(),updated_at=now() where id=v_id;
    update public.appointments set status='completed',completed_at=v_end,updated_by=auth.uid(),updated_at=now() where id=v_id;

    v_ids := array_append(v_ids,v_id);
    v_i := v_i+1;
  end loop;

  return jsonb_build_object('appointment_ids',to_jsonb(v_ids),'count',cardinality(v_ids),'final_value_each',v_final,'reused',false);
end
$$;

revoke all on function public.register_completed_services(uuid,uuid[],uuid,date,time without time zone,uuid,uuid,text,numeric,text,numeric,text) from public,anon;
grant execute on function public.register_completed_services(uuid,uuid[],uuid,date,time without time zone,uuid,uuid,text,numeric,text,numeric,text) to authenticated;
