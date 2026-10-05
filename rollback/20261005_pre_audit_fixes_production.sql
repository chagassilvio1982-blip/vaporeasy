-- Rollback produção Vaporeasy antes das correções da auditoria 2026-10-05
-- Origem: Supabase asuppjeomaymzromgcrp

drop trigger if exists clients_guard_archive on public.clients;
drop trigger if exists vehicles_guard_archive on public.vehicles;
drop function if exists private.guard_client_archive();
drop function if exists private.guard_vehicle_archive();
drop function if exists public.archive_client_safe(uuid);
drop function if exists public.register_completed_services(uuid,uuid[],uuid,date,time without time zone,uuid,uuid,text,numeric,text,numeric,text);

CREATE OR REPLACE FUNCTION private.notify_public_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
    declare
      v_client text;
      v_vehicle text;
      v_service text;
      v_booking_mode text;
      v_when text;
      v_title text;
      v_message text;
    begin
      if new.source <> 'public' then
        return new;
      end if;

      select c.name
        into v_client
      from public.clients c
      where c.id = new.client_id;

      select concat_ws(' ', v.brand, v.model)
        into v_vehicle
      from public.vehicles v
      where v.id = new.vehicle_id;

      select s.name, s.booking_mode
        into v_service, v_booking_mode
      from public.services s
      where s.id = new.service_id;

      v_when := to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI');

      if v_booking_mode = 'request' then
        v_title := 'Nova solicitação de agendamento';
        v_message := concat_ws(' • ',
          coalesce(v_client,'Cliente'),
          coalesce(v_vehicle,'Veículo'),
          coalesce(v_service,'Serviço'),
          v_when,
          'Aguardando confirmação'
        );
      else
        v_title := 'Novo agendamento público';
        v_message := concat_ws(' • ',
          coalesce(v_client,'Cliente'),
          coalesce(v_vehicle,'Veículo'),
          coalesce(v_service,'Serviço'),
          v_when
        );
      end if;

      insert into public.app_notifications(user_id, appointment_id, type, title, message)
      select p.user_id, new.id, 'public_booking', v_title, v_message
      from public.app_profiles p
      where p.active;

      return new;
    end;
    $function$


CREATE OR REPLACE FUNCTION private.v2_guard_appointment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_gross numeric;
  v_expected_percent numeric;
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

        v_expected_percent := case
          when v_gross > 0 then round(coalesce(new.discount_amount,0)/v_gross*100,2)
          else 0
        end;

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
        select 1
        from public.appointment_completion_photos p
        join storage.objects o
          on o.bucket_id='completion-photos'
         and o.name=p.storage_path
        where p.appointment_id=new.id
      )
      and not exists(
        select 1
        from public.appointment_completion_exceptions e
        where e.appointment_id=new.id
          and length(btrim(e.reason)) >= 10
      ) then
        raise exception using errcode='42501',
          message='Registre uma foto final válida ou uma justificativa de exceção antes de concluir.';
      end if;
      new.completed_at:=clock_timestamp();
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
$function$


CREATE OR REPLACE FUNCTION private.v2_photo_write_allowed(p_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.appointments; actor uuid:=auth.uid(); role_name text:=private.current_app_role();
begin
  if actor is null or coalesce(role_name,'') not in ('owner','admin','operator') then return false; end if;
  if split_part(p_path,'/',2)<>actor::text or split_part(p_path,'/',3)<>'final.jpg'
     or array_length(string_to_array(p_path,'/'),1)<>3 then return false; end if;
  begin
    select * into a from public.appointments where id=split_part(p_path,'/',1)::uuid for update;
  exception when invalid_text_representation then return false; end;
  if a.id is null or a.deleted_at is not null or a.status in ('completed','cancelled','no_show') then return false; end if;
  if role_name in ('owner','admin') then return true; end if;
  return (a.team_id is null and a.collaborator_id is null)
    or exists(select 1 from public.collaborators c where c.user_id=actor and c.active and
      (c.id=a.collaborator_id or exists(select 1 from public.team_members tm where tm.team_id=a.team_id and tm.collaborator_id=c.id)));
end $function$

