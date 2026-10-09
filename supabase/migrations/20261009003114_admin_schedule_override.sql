-- Explicit administrator-authorized one-time bookings. Vehicle overlap remains prohibited.
alter table public.appointments
 add column schedule_override boolean not null default false,
 add column schedule_override_by uuid references auth.users(id),
 add column schedule_override_at timestamptz,
 add column schedule_override_reason text;
alter table public.appointments add constraint appointments_override_audit_check check (
 (not schedule_override and schedule_override_by is null and schedule_override_at is null and schedule_override_reason is null)
 or (schedule_override and schedule_override_by is not null and schedule_override_at is not null and length(btrim(schedule_override_reason))>=10)
);
alter table public.appointments drop constraint appointments_team_no_overlap;
alter table public.appointments add constraint appointments_team_no_overlap exclude using gist
 (team_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
 where (team_id is not null and deleted_at is null and status not in ('cancelled','no_show') and not schedule_override);
alter table public.appointments drop constraint appointments_collaborator_no_overlap;
alter table public.appointments add constraint appointments_collaborator_no_overlap exclude using gist
 (collaborator_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
 where (collaborator_id is not null and deleted_at is null and status not in ('cancelled','no_show') and not schedule_override);

create or replace function private.guard_schedule_override() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
 if TG_OP='INSERT' then
  if current_setting('vaporeasy.schedule_override',true)='approved' then
   if auth.uid() is null or coalesce(private.current_app_role(),'') not in ('owner','admin')
      or new.source<>'internal' or new.recurring_plan_id is not null then
    raise exception using errcode='42501',message='Encaixe permitido apenas ao ADM, para atendimento pontual.';
   end if;
   new.schedule_override:=true;
   new.schedule_override_by:=auth.uid();
   new.schedule_override_at:=clock_timestamp();
   new.schedule_override_reason:=current_setting('vaporeasy.schedule_override_reason',true);
  elsif new.schedule_override or new.schedule_override_by is not null or new.schedule_override_at is not null or new.schedule_override_reason is not null then
   raise exception using errcode='42501',message='Use o fluxo de encaixe autorizado pelo ADM.';
  end if;
 elsif row(new.schedule_override,new.schedule_override_by,new.schedule_override_at,new.schedule_override_reason)
       is distinct from row(old.schedule_override,old.schedule_override_by,old.schedule_override_at,old.schedule_override_reason) then
  raise exception using errcode='42501',message='O registro de autorização do encaixe não pode ser alterado.';
 elsif old.schedule_override and row(new.starts_at,new.service_id,new.vehicle_id,new.team_id,new.collaborator_id,new.client_id)
        is distinct from row(old.starts_at,old.service_id,old.vehicle_id,old.team_id,old.collaborator_id,old.client_id) then
  raise exception using errcode='42501',message='Para remanejar um encaixe autorizado, cancele e crie um novo encaixe.';
 end if;
 return new;
end $$;
revoke all on function private.guard_schedule_override() from public,anon,authenticated;
create trigger appointments_override_guard before insert or update on public.appointments
 for each row execute function private.guard_schedule_override();

CREATE OR REPLACE FUNCTION private.validate_appointment_schedule()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
    declare
      v_service_duration integer;
      v_total_duration integer;
      v_first_slot time;
      v_end timestamptz;
      v_date date;
      v_capacity integer;
      v_busy integer;
    begin
      select s.duration_minutes,s.first_slot_time
        into v_service_duration,v_first_slot
      from public.services s
      where s.id=new.service_id;

      if v_service_duration is null then
        raise exception using errcode='P0001',message='Serviço inválido ou sem duração configurada.';
      end if;

      v_total_duration := v_service_duration + coalesce(new.addon_duration_minutes,0);
      new.duration_minutes:=v_total_duration;
      v_end:=new.starts_at+make_interval(mins=>v_total_duration);
      new.ends_at:=v_end;
      v_date:=(new.starts_at at time zone 'America/Sao_Paulo')::date;
      v_capacity:=private.schedule_capacity_for_date(v_date);

      if v_capacity<=0 and not new.schedule_override then
        raise exception using errcode='P0001',message='A Vaporeasy não realiza atendimentos aos domingos.';
      end if;

      if not new.schedule_override and v_first_slot is not null
         and ((new.starts_at at time zone 'America/Sao_Paulo')::time<>v_first_slot) then
        raise exception using errcode='P0001',
          message=format('Este serviço deve começar no primeiro horário do dia (%s).',to_char(v_first_slot,'HH24:MI'));
      end if;

      if exists(
        select 1 from public.appointments a
        where a.id is distinct from new.id
          and a.deleted_at is null
          and a.status<>'cancelled'
          and a.vehicle_id=new.vehicle_id
          and a.starts_at<v_end
          and coalesce(a.ends_at,a.starts_at+make_interval(mins=>a.duration_minutes))>new.starts_at
      ) then
        raise exception using errcode='P0001',message='Este veículo já possui um atendimento que ocupa parte desse período.';
      end if;

      select count(*)::integer into v_busy
      from public.appointments a
      where a.id is distinct from new.id
        and a.deleted_at is null
        and a.status<>'cancelled'
        and a.starts_at<v_end
        and coalesce(a.ends_at,a.starts_at+make_interval(mins=>a.duration_minutes))>new.starts_at;

      if coalesce(v_busy,0)>=v_capacity and not new.schedule_override then
        if extract(dow from v_date)=6 then
          raise exception using errcode='P0001',message='Aos sábados apenas uma equipe atende e ela já está ocupada nesse período.';
        else
          raise exception using errcode='P0001',message='Não há equipe disponível durante todo o período deste serviço.';
        end if;
      end if;

      if new.team_id is not null then
        if not exists(select 1 from public.teams t where t.id=new.team_id and t.active) then
          raise exception using errcode='P0001',message='A equipe selecionada não está ativa.';
        end if;

        if not new.schedule_override and exists(
          select 1
          from public.appointments a
          where a.id is distinct from new.id
            and a.deleted_at is null
            and a.status<>'cancelled'
            and a.starts_at<v_end
            and coalesce(a.ends_at,a.starts_at+make_interval(mins=>a.duration_minutes))>new.starts_at
            and (
              a.team_id=new.team_id
              or a.collaborator_id in (
                select tm.collaborator_id from public.team_members tm where tm.team_id=new.team_id
              )
            )
        ) then
          raise exception using errcode='P0001',message='Esta equipe já possui um atendimento que ocupa parte desse período.';
        end if;
      end if;

      if new.collaborator_id is not null then
        if not new.schedule_override and exists(
          select 1
          from public.appointments a
          where a.id is distinct from new.id
            and a.deleted_at is null
            and a.status<>'cancelled'
            and a.starts_at<v_end
            and coalesce(a.ends_at,a.starts_at+make_interval(mins=>a.duration_minutes))>new.starts_at
            and (
              a.collaborator_id=new.collaborator_id
              or a.team_id in (
                select tm.team_id from public.team_members tm where tm.collaborator_id=new.collaborator_id
              )
            )
        ) then
          raise exception using errcode='P0001',message='Este colaborador já está ocupado nesse período.';
        end if;
      end if;

      return new;
    end;
    $function$
;

create or replace function public.create_admin_schedule_override(
 p_client_id uuid,p_vehicle_ids uuid[],p_service_id uuid,p_date date,p_local_time time,
 p_team_id uuid default null,p_collaborator_id uuid default null,p_notes text default '',
 p_idempotency_key text default null,p_reason text default '')
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
 result jsonb; existing_ids uuid[]; previous text; previous_reason text;
 n integer; s public.services%rowtype; tz text; first_start timestamptz;
 group_id uuid:=gen_random_uuid(); ids uuid[]:='{}'; ap uuid; v uuid; i integer; price numeric; size text; prefix text;
begin
 if auth.uid() is null or coalesce(private.current_app_role(),'') not in ('owner','admin') then
  raise exception using errcode='42501',message='Somente ADM pode autorizar um encaixe.';
 end if;
 if p_date is null or p_local_time is null or p_date<(now() at time zone 'America/Sao_Paulo')::date then
  raise exception 'Informe data atual ou futura e horário válido.';
 end if;
 if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Informe a justificativa do encaixe (mínimo 10 caracteres).'; end if;
 if nullif(btrim(p_idempotency_key),'') is null then raise exception 'Identificador do encaixe obrigatório.'; end if;
 if p_team_id is not null and p_collaborator_id is not null then raise exception 'Selecione equipe ou colaborador, não os dois.'; end if;
 n:=coalesce(cardinality(p_vehicle_ids),0);
 if n<1 or n>20 then raise exception 'Selecione de 1 a 20 veículos.'; end if;
 if (select count(distinct x) from unnest(p_vehicle_ids) x)<>n then raise exception 'Há veículos repetidos na seleção.'; end if;
 if (select count(*) from public.vehicles where id=any(p_vehicle_ids) and client_id=p_client_id and archived_at is null)<>n then
  raise exception 'Um dos veículos não pertence a este cliente ou está inativo.';
 end if;
 select * into s from public.services where id=p_service_id and active;
 if not found then raise exception 'Serviço indisponível.'; end if;
 if lower(btrim(coalesce(s.category,''))) like 'pacote%' then
  raise exception 'Contrate planos pelo agendamento regular. O encaixe é para atendimento pontual.';
 end if;
 if p_team_id is not null and not exists(select 1 from public.teams where id=p_team_id and active) then raise exception 'A equipe selecionada não está ativa.'; end if;
 if p_collaborator_id is not null and not exists(select 1 from public.collaborators where id=p_collaborator_id and active) then raise exception 'O colaborador selecionado não está ativo.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_idempotency_key,0));
 prefix:='internal-batch:'||auth.uid()::text||':'||p_idempotency_key||':';
 select array_agg(id order by booking_item_index) into existing_ids from public.appointments
 where left(idempotency_key,length(prefix))=prefix;
 if existing_ids is not null then
  return jsonb_build_object('appointment_ids',to_jsonb(existing_ids),'count',cardinality(existing_ids),'recurring_count',0,'package_billing','[]'::jsonb,'schedule_override',true);
 end if;
 select timezone into tz from public.schedule_settings where id=1;
 first_start:=(p_date+p_local_time) at time zone coalesce(tz,'America/Sao_Paulo');
 previous:=coalesce(current_setting('vaporeasy.schedule_override',true),'');
 previous_reason:=coalesce(current_setting('vaporeasy.schedule_override_reason',true),'');
 perform set_config('vaporeasy.schedule_override','approved',true);
 perform set_config('vaporeasy.schedule_override_reason',btrim(p_reason),true);
 -- A one-time override never changes recurring plans, subscriptions or existing charges.
 for i in 1..n loop
  v:=p_vehicle_ids[i];
  select package_size into size from public.vehicles where id=v;
  if s.size_pricing_enabled then
   if size is null or size not in ('pm','g') then raise exception 'Defina o porte P/M ou G do veículo.'; end if;
   price:=case when size='g' then coalesce(s.price_g,s.price) else coalesce(s.price_pm,s.price) end;
  else price:=s.price; end if;
  insert into public.appointments(booking_group_id,booking_item_index,client_id,vehicle_id,service_id,team_id,collaborator_id,
    starts_at,duration_minutes,status,source,base_value,discount_percent,discount_amount,final_value,
    notes,idempotency_key,created_by,updated_by)
  values(group_id,i-1,p_client_id,v,p_service_id,p_team_id,p_collaborator_id,
    first_start+make_interval(mins=>s.duration_minutes*(i-1)),s.duration_minutes,'scheduled','internal',price,0,0,price,
    coalesce(p_notes,''),prefix||(i-1)::text,auth.uid(),auth.uid())
  returning id into ap;
  ids:=array_append(ids,ap);
 end loop;
 perform set_config('vaporeasy.schedule_override',previous,true);
 perform set_config('vaporeasy.schedule_override_reason',previous_reason,true);
 return jsonb_build_object('booking_group_id',group_id,'appointment_ids',to_jsonb(ids),'count',n,'recurring_count',0,'weekly_count',0,'biweekly_count',0,'package_billing','[]'::jsonb,'schedule_override',true);
end $$;
revoke all on function public.create_admin_schedule_override(uuid,uuid[],uuid,date,time,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.create_admin_schedule_override(uuid,uuid[],uuid,date,time,uuid,uuid,text,text,text) to authenticated;
create or replace function private.v2_read_appointments() returns setof public.appointments
language sql stable security definer set search_path=pg_catalog,public as $$
 select (jsonb_populate_record(null::public.appointments, to_jsonb(t) ||
   case when private.current_app_role() in ('owner','admin') then '{}'::jsonb
   else jsonb_build_object('base_value',null,'discount_percent',null,'discount_amount',null,'final_value',null,'addon_value',null) end)).*
 from public.appointments t where auth.uid() is not null and private.is_active_user()
$$;
