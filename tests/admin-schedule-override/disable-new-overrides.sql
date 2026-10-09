-- Feature-off rollback: keep authorized records usable and audited.
revoke execute on function public.create_admin_schedule_override(uuid,uuid[],uuid,date,time,uuid,uuid,text,text,text) from authenticated;
