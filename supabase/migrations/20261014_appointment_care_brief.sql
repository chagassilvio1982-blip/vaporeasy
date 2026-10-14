
create function public.appointment_care_brief(p_appointment_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private as $$
declare
 a public.appointments; s public.package_subscriptions; role_name text; m date; n date;
 plan_name text; visit_limit integer; source_name text; benefits jsonb; performed jsonb;
 visits jsonb; recent_visits jsonb; last_visit date; vehicle_note text;
begin
 role_name:=private.current_app_role();
 if auth.uid() is null or role_name not in ('owner','admin','operator') then
  raise exception using errcode='42501',message='Sem permissão para consultar os cuidados.';
 end if;
 select * into a from public.appointments where id=p_appointment_id and deleted_at is null;
 if not found or (role_name='operator' and not private.operator_is_assigned_today(a.id)) then
  raise exception using errcode='42501',message='Atendimento indisponível.';
 end if;
 m:=date_trunc('month',a.starts_at at time zone 'America/Sao_Paulo')::date;
 n:=(m+interval '1 month')::date;
 select p.notes into vehicle_note from public.vehicle_profiles p where p.vehicle_id=a.vehicle_id;
 select (v.starts_at at time zone 'America/Sao_Paulo')::date into last_visit
 from public.appointments v where v.vehicle_id=a.vehicle_id and v.client_id=a.client_id
 and v.status='completed' and v.deleted_at is null
 order by v.starts_at desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('date',t.visit_date) order by t.visit_date desc),'[]'::jsonb) into recent_visits
 from (select (v.starts_at at time zone 'America/Sao_Paulo')::date as visit_date
 from public.appointments v where v.vehicle_id=a.vehicle_id and v.client_id=a.client_id
 and v.status='completed' and v.deleted_at is null
 order by v.starts_at desc limit 8) t;
 if a.recurring_plan_id is not null then
  select sub.* into s from public.package_subscriptions sub
  where sub.recurring_plan_id=a.recurring_plan_id and sub.vehicle_id=a.vehicle_id and sub.client_id=a.client_id
  and sub.starts_on<=((a.starts_at at time zone 'America/Sao_Paulo')::date)
  order by sub.starts_on desc,sub.created_at desc limit 1;
 end if;
 if s.id is null then
  return jsonb_build_object('is_plan',false,'last_visit',last_visit,'recent_visits',recent_visits,
   'appointment_notes',coalesce(a.notes,''),'vehicle_notes',coalesce(vehicle_note,''));
 end if;
 select sv.name into plan_name from public.services sv where sv.id=s.service_id;
 select c.visits_per_month into visit_limit from public.package_charges c
 where c.subscription_id=s.id and c.competence_month=m and c.status<>'cancelled'
 order by c.created_at desc limit 1;
 if visit_limit is null and m=date_trunc('month',(now() at time zone 'America/Sao_Paulo')::date)::date then
   visit_limit:=s.visits_per_month;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'label',b.service_label,
   'frequency',b.frequency,'quantity',b.monthly_quantity)
   order by b.service_label),'[]'::jsonb) into benefits
 from public.package_included_benefits b where b.subscription_id=s.id
 and b.effective_from_month<=m and (b.retired_from_month is null or b.retired_from_month>m);
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'label',e.service_label,
   'date',e.performed_on,'notes',e.notes,'appointment_id',e.appointment_id)
   order by e.performed_on desc,e.created_at desc),'[]'::jsonb) into performed
 from public.package_service_events e where e.subscription_id=s.id and e.voided_at is null
 and e.performed_on>=m and e.performed_on<n;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'date',t.visit_date)
   order by t.visit_date desc),'[]'::jsonb) into visits
 from (select v.id,(v.starts_at at time zone 'America/Sao_Paulo')::date as visit_date
 from public.appointments v where v.client_id=a.client_id and v.vehicle_id=a.vehicle_id
 and v.recurring_plan_id=s.recurring_plan_id and v.status='completed' and v.deleted_at is null
 and v.starts_at>=(m::timestamp at time zone 'America/Sao_Paulo')
 and v.starts_at<(n::timestamp at time zone 'America/Sao_Paulo')) t;
 return jsonb_build_object('is_plan',true,'plan_name',plan_name,'subscription_id',s.id,
  'month',m,'visits_limit',visit_limit,'visits',visits,'benefits',benefits,
  'performed',performed,'last_visit',last_visit,'recent_visits',recent_visits,
  'appointment_notes',coalesce(a.notes,''),'vehicle_notes',coalesce(vehicle_note,''));
end $$;
revoke all on function public.appointment_care_brief(uuid) from public,anon;
grant execute on function public.appointment_care_brief(uuid) to authenticated;
