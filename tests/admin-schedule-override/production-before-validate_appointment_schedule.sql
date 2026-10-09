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

      if v_capacity<=0 then
        raise exception using errcode='P0001',message='A Vaporeasy não realiza atendimentos aos domingos.';
      end if;

      if v_first_slot is not null
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

      if coalesce(v_busy,0)>=v_capacity then
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

        if exists(
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
        if exists(
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
