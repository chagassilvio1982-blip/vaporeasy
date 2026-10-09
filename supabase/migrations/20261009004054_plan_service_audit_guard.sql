alter table public.package_service_events drop constraint package_service_events_check;
alter table public.package_service_events add constraint package_service_events_check check ((voided_at is null and voided_by is null and void_reason is null) or (voided_at is not null and voided_by is not null and void_reason is not null and length(btrim(void_reason))>=6));
