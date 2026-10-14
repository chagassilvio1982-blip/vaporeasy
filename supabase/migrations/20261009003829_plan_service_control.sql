create table public.package_service_events (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.package_subscriptions(id),
 appointment_id uuid references public.appointments(id),
 performed_on date not null,
 service_label text not null check (length(btrim(service_label)) between 3 and 120),
 notes text not null default '' check (length(notes)<=2000),
 request_key uuid not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 voided_at timestamptz,
 voided_by uuid references auth.users(id),
 void_reason text,
 unique(created_by,request_key),
 check ((voided_at is null and voided_by is null and void_reason is null)
   or (voided_at is not null and voided_by is not null and length(btrim(void_reason))>=6))
);
alter table public.package_service_events enable row level security;
revoke all on public.package_service_events from public,anon,authenticated;
grant select on public.package_service_events to authenticated;
create policy package_service_events_admin_read on public.package_service_events
 for select to authenticated using ((select auth.uid()) is not null and (select private.current_app_role()) in ('owner','admin'));
create index package_service_events_month_idx on public.package_service_events(subscription_id,performed_on) where voided_at is null;

create function public.register_package_service(p_subscription_id uuid,p_performed_on date,p_service_label text,
 p_notes text default '',p_appointment_id uuid default null,p_request_key uuid default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare s public.package_subscriptions; a public.appointments; event public.package_service_events;
begin
 if auth.uid() is null or coalesce(private.current_app_role(),'') not in ('owner','admin') then
  raise exception using errcode='42501',message='Somente ADM pode registrar serviços do plano.';
 end if;
 select * into s from public.package_subscriptions where id=p_subscription_id;
 if not found then raise exception 'Plano não encontrado.'; end if;
 if p_performed_on is null or p_performed_on<s.starts_on or p_performed_on>(now() at time zone 'America/Sao_Paulo')::date then
  raise exception 'Informe uma data realizada, a partir do início do plano e até hoje.';
 end if;
 if length(btrim(coalesce(p_service_label,''))) not between 3 and 120 or length(coalesce(p_notes,''))>2000 or p_request_key is null then
  raise exception 'Informe o serviço, observações válidas e identificador do registro.';
 end if;
 if p_appointment_id is not null then
  select * into a from public.appointments where id=p_appointment_id and deleted_at is null and status='completed';
  if not found or a.client_id<>s.client_id or a.vehicle_id<>s.vehicle_id or a.recurring_plan_id is distinct from s.recurring_plan_id
    or (a.starts_at at time zone 'America/Sao_Paulo')::date<>p_performed_on then
   raise exception 'O atendimento precisa estar concluído e pertencer a este plano, veículo e data.';
  end if;
 end if;
 insert into public.package_service_events(subscription_id,appointment_id,performed_on,service_label,notes,request_key,created_by)
 values(s.id,p_appointment_id,p_performed_on,btrim(p_service_label),btrim(coalesce(p_notes,'')),p_request_key,auth.uid())
 on conflict(created_by,request_key) do nothing returning * into event;
 if event.id is null then
  select * into event from public.package_service_events where created_by=auth.uid() and request_key=p_request_key;
  if event.subscription_id<>s.id or event.performed_on<>p_performed_on or event.service_label<>btrim(p_service_label)
   or event.appointment_id is distinct from p_appointment_id or event.notes<>btrim(coalesce(p_notes,'')) then
   raise exception 'Este identificador já foi usado para outro registro. Reabra o formulário.';
  end if;
 end if;
 return event.id;
end $$;

create function public.void_package_service(p_event_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
 if auth.uid() is null or coalesce(private.current_app_role(),'') not in ('owner','admin') then
  raise exception using errcode='42501',message='Somente ADM pode anular registros do plano.';
 end if;
 if length(btrim(coalesce(p_reason,'')))<6 then raise exception 'Informe o motivo da anulação (mínimo 6 caracteres).'; end if;
 if not exists(select 1 from public.package_service_events where id=p_event_id) then raise exception 'Registro não encontrado.'; end if;
 update public.package_service_events set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason)
 where id=p_event_id and voided_at is null;
 return p_event_id;
end $$;

create function public.get_client_plan_control(p_client_id uuid,p_month date) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
declare m date; n date; result jsonb;
begin
 if auth.uid() is null or coalesce(private.current_app_role(),'') not in ('owner','admin') then
  raise exception using errcode='42501',message='Seu perfil não pode consultar o controle dos planos.';
 end if;
 if p_month is null then raise exception 'Selecione o mês.'; end if;
 m:=date_trunc('month',p_month)::date;n:=(m+interval '1 month')::date;
 if not exists(select 1 from public.clients where id=p_client_id) then raise exception 'Cliente não encontrado.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'vehicle_id',s.vehicle_id,'vehicle',v.brand||' '||v.model,'plate',v.plate,
  'plan',sv.name,'active',s.active,'starts_on',s.starts_on,
  'limit_visits',case when ch.id is not null then ch.visits_per_month when m=date_trunc('month',(now() at time zone 'America/Sao_Paulo'))::date then s.visits_per_month else null end,
  'limit_source',case when ch.id is not null then 'month_snapshot' when m=date_trunc('month',(now() at time zone 'America/Sao_Paulo'))::date then 'current_contract' else 'unknown' end,
  'completed',coalesce(ap.completed,0),'scheduled',coalesce(ap.scheduled,0),
  'visits',coalesce(ap.visits,'[]'::jsonb),'services',coalesce(ev.services,'[]'::jsonb)
 ) order by v.brand,v.model,s.created_at desc),'[]'::jsonb) into result
 from public.package_subscriptions s
 join public.vehicles v on v.id=s.vehicle_id
 join public.services sv on sv.id=s.service_id
 left join lateral (select c.id,c.visits_per_month from public.package_charges c
   where c.subscription_id=s.id and c.competence_month=m and c.status<>'cancelled' order by c.created_at desc limit 1) ch on true
 left join lateral (
  select count(*) filter(where a.status='completed') as completed,
   count(*) filter(where a.status in ('requested','scheduled','confirmed','in_progress')) as scheduled,
   jsonb_agg(jsonb_build_object('id',a.id,'date',(a.starts_at at time zone 'America/Sao_Paulo')::date,'status',a.status)
    order by a.starts_at) filter(where a.status='completed') as visits
  from public.appointments a where a.recurring_plan_id=s.recurring_plan_id and a.deleted_at is null
   and a.starts_at>=(m::timestamp at time zone 'America/Sao_Paulo') and a.starts_at<(n::timestamp at time zone 'America/Sao_Paulo')
 ) ap on true
 left join lateral (
  select jsonb_agg(jsonb_build_object('id',e.id,'date',e.performed_on,'label',e.service_label,'notes',e.notes,'appointment_id',e.appointment_id)
   order by e.performed_on,e.created_at) as services
  from public.package_service_events e where e.subscription_id=s.id and e.voided_at is null and e.performed_on>=m and e.performed_on<n
 ) ev on true
 where s.client_id=p_client_id and s.starts_on<n
  and (s.active or ch.id is not null or ap.completed>0 or ev.services is not null);
 return jsonb_build_object('client_id',p_client_id,'month',m,'subscriptions',result);
end $$;
revoke all on function public.register_package_service(uuid,date,text,text,uuid,uuid) from public,anon;
revoke all on function public.void_package_service(uuid,text) from public,anon;
revoke all on function public.get_client_plan_control(uuid,date) from public,anon;
grant execute on function public.register_package_service(uuid,date,text,text,uuid,uuid) to authenticated;
grant execute on function public.void_package_service(uuid,text) to authenticated;
grant execute on function public.get_client_plan_control(uuid,date) to authenticated;
