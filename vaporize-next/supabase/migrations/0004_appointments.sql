-- Vaporize Next / migration 0004: appointments in isolated schema only
-- Additive. No browser writes or changes to V2/production.
create unique index if not exists next_vehicles_id_org_unique
 on vaporize_next.vehicles (id, organization_id);

create table if not exists vaporize_next.appointments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references vaporize_next.organizations(id) on delete restrict,
 vehicle_id uuid not null,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 status text not null default 'scheduled'
  check (status in ('scheduled','in_progress','completed','cancelled')),
 notes text,
 created_at timestamptz not null default now(),
 constraint next_appointment_valid_interval check (ends_at > starts_at),
 constraint next_appointment_vehicle_same_org foreign key (vehicle_id, organization_id)
  references vaporize_next.vehicles(id, organization_id) on delete restrict
);
create index if not exists next_appointments_org_start_idx
 on vaporize_next.appointments (organization_id, starts_at);
alter table vaporize_next.appointments enable row level security;
create policy next_appointments_read on vaporize_next.appointments
 for select to authenticated
 using (vaporize_next.is_member(organization_id));
grant select on vaporize_next.appointments to authenticated;
grant all on vaporize_next.appointments to service_role;
