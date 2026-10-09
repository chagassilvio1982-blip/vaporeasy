CREATE OR REPLACE FUNCTION private.v2_read_appointments()
 RETURNS SETOF appointments
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select t.id,
t.booking_group_id,
t.booking_item_index,
t.client_id,
t.vehicle_id,
t.service_id,
t.collaborator_id,
t.recurring_plan_id,
t.starts_at,
t.duration_minutes,
t.status,
t.source,
case when private.current_app_role() in ('owner','admin') then t.base_value else null end as base_value,
case when private.current_app_role() in ('owner','admin') then t.discount_percent else null end as discount_percent,
case when private.current_app_role() in ('owner','admin') then t.final_value else null end as final_value,
t.notes,
t.idempotency_key,
t.cancelled_at,
t.completed_at,
t.deleted_at,
t.created_by,
t.updated_by,
t.created_at,
t.updated_at,
t.ends_at,
t.addon_duration_minutes,
case when private.current_app_role() in ('owner','admin') then t.addon_value else null end as addon_value,
t.team_id from public.appointments t
where auth.uid() is not null and private.is_active_user() $function$
;
