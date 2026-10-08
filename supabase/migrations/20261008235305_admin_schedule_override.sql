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
        if not exists(select 1 from public.collaborators c where c.id=new.collaborator_id and c.active) then
          raise exception 'O colaborador selecionado não está ativo.';
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
    
$function$;

CREATE OR REPLACE FUNCTION public.create_multi_vehicle_booking_recurring(p_client_id uuid, p_vehicle_ids uuid[], p_service_id uuid, p_date date, p_local_time time without time zone, p_recurrences jsonb DEFAULT '[]'::jsonb, p_team_id uuid DEFAULT NULL::uuid, p_collaborator_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT ''::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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
  v_gross_monthly numeric;
  v_discount_type text:='none';
  v_discount_raw numeric:=0;
  v_discount_amount numeric:=0;
  v_current_gross numeric;
  v_subscription_id uuid;
  v_charge_id uuid;
  v_billing jsonb:='[]'::jsonb;
  v_current_subscription_id uuid;
  v_current_plan_id uuid;
  v_current_monthly numeric;
  v_effective_month date;
  v_effective_start date;
  v_effective_start_ts timestamptz;
  v_target_dow integer;
  v_month_dow integer;
  v_scheduled record;
begin
  v_role:=private.current_app_role();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception using errcode='42501',message='Seu perfil não pode criar agendamentos.';
  end if;

  if p_date < current_date then
    raise exception using errcode='22023',message='Datas passadas devem ser registradas pelo fluxo Registrar serviço realizado. Agendamentos retroativos não podem criar ou alterar recorrências futuras.';
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

  if not coalesce(v_slot_ok,false) and current_setting('vaporeasy.schedule_override',true) is distinct from 'approved' then
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

    v_discount_type:='none';
    v_discount_raw:=0;
    v_discount_amount:=0;
    v_gross_monthly:=null;

    select
      lower(nullif(btrim(x->>'frequency'),'')),
      lower(coalesce(nullif(btrim(x->>'commercial_discount_type'),''),'none')),
      coalesce(nullif(btrim(x->>'commercial_discount_value'),'')::numeric,0)
      into v_frequency,v_discount_type,v_discount_raw
    from jsonb_array_elements(coalesce(p_recurrences,'[]'::jsonb)) x
    where nullif(x->>'vehicle_id','')::uuid=v_vehicle
    limit 1;

    if v_is_package then
      if v_frequency not in ('weekly','biweekly') then
        raise exception 'Para pacote, escolha Quinzenal ou Semanal.';
      end if;
      v_package_units:=case when v_frequency='weekly' then 2 else 1 end;
      v_visits:=case when v_frequency='weekly' then 4 else 2 end;
      v_gross_monthly:=round(v_price*v_package_units,2);

      if v_discount_type='percent' then
        if v_discount_raw<0 or v_discount_raw>100 then
          raise exception 'O desconto percentual do plano deve ficar entre 0%% e 100%%.';
        end if;
        v_discount_amount:=round(v_gross_monthly*v_discount_raw/100,2);
      elsif v_discount_type='fixed' then
        if v_discount_raw<0 or v_discount_raw>v_gross_monthly then
          raise exception 'O desconto comercial do plano não pode ser negativo nem maior que a mensalidade de tabela.';
        end if;
        v_discount_amount:=round(v_discount_raw,2);
      elsif v_discount_type='none' then
        v_discount_amount:=0;
      else
        raise exception 'Tipo de desconto comercial do plano inválido.';
      end if;

      v_monthly:=greatest(0,round(v_gross_monthly-v_discount_amount,2));
    else
      v_frequency:=coalesce(v_frequency,'once');
      if v_frequency not in ('once','weekly','biweekly') then
        raise exception 'Frequência inválida para um dos veículos.';
      end if;
    end if;

    v_current_subscription_id:=null;
    v_current_plan_id:=null;
    v_current_monthly:=null;
    v_current_gross:=null;

    if v_is_package then
      select ps.id,ps.recurring_plan_id,ps.monthly_amount,round(ps.unit_price*ps.package_units,2)
        into v_current_subscription_id,v_current_plan_id,v_current_monthly,v_current_gross
      from public.package_subscriptions ps
      where ps.vehicle_id=v_vehicle
        and ps.active
      order by ps.created_at desc
      limit 1;
    end if;

    for v_scheduled in
      select ps.id,ps.recurring_plan_id
      from public.package_subscriptions ps
      where ps.vehicle_id=v_vehicle
        and ps.active=false
        and ps.replaces_subscription_id is not null
        and ps.scheduled_effective_on is not null
        and ps.superseded_at is null
    loop
      update public.appointments
         set status='cancelled',updated_at=now()
       where recurring_plan_id=v_scheduled.recurring_plan_id
         and deleted_at is null
         and status in ('requested','scheduled','confirmed');

      update public.recurring_plans
         set active=false,updated_at=now()
       where id=v_scheduled.recurring_plan_id;

      update public.package_subscriptions
         set superseded_at=now(),updated_by=auth.uid(),updated_at=now()
       where id=v_scheduled.id;
    end loop;

    if v_is_package
       and v_current_subscription_id is not null
       and v_gross_monthly<v_current_gross then

      v_effective_month:=greatest(
        date_trunc('month',(current_date+interval '1 month'))::date,
        date_trunc('month',p_date)::date
      );

      v_target_dow:=extract(dow from p_date)::integer;
      v_month_dow:=extract(dow from v_effective_month)::integer;
      v_effective_start:=v_effective_month+((v_target_dow-v_month_dow+7)%7);
      v_effective_start_ts:=((v_effective_start+p_local_time) at time zone v_tz);

      update public.appointments
         set status='cancelled',updated_at=now()
       where recurring_plan_id=v_current_plan_id
         and deleted_at is null
         and status in ('requested','scheduled','confirmed')
         and (starts_at at time zone v_tz)::date>=v_effective_month;

      select exists(
        select 1
        from public.get_multi_vehicle_slots(
          v_effective_start,p_service_id,array[v_vehicle],p_collaborator_id,p_team_id
        ) s
        where s.starts_at=v_effective_start_ts
      ) into v_slot_ok;

      if not coalesce(v_slot_ok,false) then
        raise exception 'O horário escolhido não está disponível para o primeiro atendimento do novo pacote no próximo mês.';
      end if;

      insert into public.recurring_plans(
        client_id,vehicle_id,service_id,frequency,weekday,local_time,start_date,
        base_value,discount_percent,final_value,notes,active,
        team_id,collaborator_id,created_by,updated_by
      )
      values(
        p_client_id,v_vehicle,p_service_id,v_frequency,
        extract(dow from v_effective_start)::smallint,p_local_time,v_effective_start,
        v_price,0,v_price,coalesce(p_notes,''),false,
        p_team_id,p_collaborator_id,auth.uid(),auth.uid()
      )
      returning id into v_plan_id;

      insert into public.package_subscriptions(
        client_id,vehicle_id,service_id,recurring_plan_id,
        frequency,visits_per_month,package_units,unit_price,monthly_amount,
        starts_on,active,scheduled_effective_on,replaces_subscription_id,
        created_by,updated_by
      )
      values(
        p_client_id,v_vehicle,p_service_id,v_plan_id,
        v_frequency,v_visits,v_package_units,v_price,v_monthly,
        v_effective_month,false,v_effective_month,v_current_subscription_id,
        auth.uid(),auth.uid()
      )
      returning id into v_subscription_id;

      perform private.materialize_recurring_plan(v_plan_id,current_date+120);

      select a.id into v_id
      from public.appointments a
      where a.recurring_plan_id=v_plan_id
        and a.idempotency_key='recurrence:'||v_plan_id::text||':'||v_effective_start::text
      limit 1;

      if v_id is null then
        raise exception 'Não foi possível preparar o primeiro atendimento do downgrade para o próximo mês.';
      end if;

      v_ids:=array_append(v_ids,v_id);
      v_plan_count:=v_plan_count+1;
      if v_frequency='weekly' then v_weekly:=v_weekly+1; end if;
      if v_frequency='biweekly' then v_biweekly:=v_biweekly+1; end if;

      v_billing:=v_billing||jsonb_build_array(jsonb_build_object(
        'vehicle_id',v_vehicle,
        'subscription_id',v_subscription_id,
        'charge_id',null,
        'frequency',v_frequency,
        'visits_per_month',v_visits,
        'package_units',v_package_units,
        'unit_price',v_price,
        'gross_monthly_amount',v_gross_monthly,
        'commercial_discount',v_discount_amount,
        'monthly_amount',v_monthly,
        'scheduled_change',true,
        'effective_on',v_effective_month,
        'first_visit_on',v_effective_start,
        'previous_monthly_amount',v_current_monthly
      ));

      continue;
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
          unit_price,amount,gross_monthly_amount,status
        )
        values(
          v_subscription_id,p_client_id,v_vehicle,p_service_id,
          date_trunc('month',p_date)::date,current_date,v_frequency,v_visits,v_package_units,
          v_price,v_monthly,v_gross_monthly,'pending'
        )
        on conflict(subscription_id,competence_month) do update
          set amount=excluded.amount,
              gross_monthly_amount=excluded.gross_monthly_amount,
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
          'gross_monthly_amount',v_gross_monthly,
          'commercial_discount',v_discount_amount,
          'monthly_amount',v_monthly,
          'scheduled_change',false
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

create or replace function public.create_admin_schedule_override(
 p_client_id uuid,p_vehicle_ids uuid[],p_service_id uuid,p_date date,p_local_time time,
 p_team_id uuid default null,p_collaborator_id uuid default null,p_notes text default '',
 p_idempotency_key text default null,p_reason text default '')
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare result jsonb; existing_ids uuid[]; previous text; previous_reason text; expected integer;
begin
 if auth.uid() is null or coalesce(private.current_app_role(),'') not in ('owner','admin') then
  raise exception using errcode='42501',message='Somente ADM pode autorizar um encaixe.';
 end if;
 if p_date is null or p_local_time is null or p_date<(now() at time zone 'America/Sao_Paulo')::date then
  raise exception 'Informe data atual ou futura e horário válido.';
 end if;
 if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Informe a justificativa do encaixe (mínimo 10 caracteres).'; end if;
 if nullif(btrim(p_idempotency_key),'') is null then raise exception 'Identificador do encaixe obrigatório.'; end if;
 if exists(select 1 from public.services where id=p_service_id and lower(btrim(coalesce(category,''))) like 'pacote%') then
  raise exception 'Contrate planos pelo agendamento regular. O encaixe é para atendimento pontual.';
 end if;
 -- Serialize retries and preserve the standard idempotency key, without bypassing duplicate-vehicle checks.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_idempotency_key,0));
 select array_agg(id order by booking_item_index) into existing_ids from public.appointments
 where idempotency_key like 'internal-batch:'||auth.uid()::text||':'||p_idempotency_key||':%';
 if existing_ids is not null then
  return jsonb_build_object('appointment_ids',to_jsonb(existing_ids),'count',cardinality(existing_ids),'recurring_count',0,'package_billing','[]'::jsonb,'schedule_override',true);
 end if;
 previous:=coalesce(current_setting('vaporeasy.schedule_override',true),'');
 previous_reason:=coalesce(current_setting('vaporeasy.schedule_override_reason',true),'');
 perform set_config('vaporeasy.schedule_override','approved',true);
 perform set_config('vaporeasy.schedule_override_reason',btrim(p_reason),true);
 result:=public.create_multi_vehicle_booking_recurring(p_client_id,p_vehicle_ids,p_service_id,p_date,p_local_time,'[]'::jsonb,p_team_id,p_collaborator_id,p_notes,p_idempotency_key);
 perform set_config('vaporeasy.schedule_override',previous,true);
 perform set_config('vaporeasy.schedule_override_reason',previous_reason,true);
 return result||jsonb_build_object('schedule_override',true);
end $$;
revoke all on function public.create_admin_schedule_override(uuid,uuid[],uuid,date,time,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.create_admin_schedule_override(uuid,uuid[],uuid,date,time,uuid,uuid,text,text,text) to authenticated;

-- Keep the typed reader compatible with the new audit columns and existing monetary columns.
create or replace function private.v2_read_appointments() returns setof public.appointments
language sql stable security definer set search_path=pg_catalog,public as $$
 select (jsonb_populate_record(null::public.appointments, to_jsonb(t) ||
   case when private.current_app_role() in ('owner','admin') then '{}'::jsonb
   else jsonb_build_object('base_value',null,'discount_percent',null,'discount_amount',null,'final_value',null,'addon_value',null) end)).*
 from public.appointments t where auth.uid() is not null and private.is_active_user()
$$;
