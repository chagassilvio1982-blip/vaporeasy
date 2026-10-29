-- Vaporize Next / migration 0001: isolated multi-tenant foundation
-- Additive only. Does not modify public schema, V2 or legacy V3 tables.
create schema if not exists vaporize_next;
revoke all on schema vaporize_next from public, anon, authenticated;
grant usage on schema vaporize_next to authenticated, service_role;

create table if not exists vaporize_next.organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 2 and 160),
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 status text not null default 'active' check (status in ('active','suspended')),
 created_at timestamptz not null default now()
);
create table if not exists vaporize_next.memberships (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references vaporize_next.organizations(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('owner','manager','collaborator')),
 status text not null default 'active' check (status in ('active','disabled')),
 created_at timestamptz not null default now(),
 unique (organization_id,user_id)
);
create index if not exists next_memberships_user_idx on vaporize_next.memberships(user_id,organization_id) where status='active';

create or replace function vaporize_next.is_member(p_organization_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
 select exists (
  select 1 from vaporize_next.memberships m
  join vaporize_next.organizations o on o.id=m.organization_id
  where m.organization_id=p_organization_id
    and m.user_id=(select auth.uid())
    and m.status='active' and o.status='active'
 );
$$;
revoke all on function vaporize_next.is_member(uuid) from public, anon;
grant execute on function vaporize_next.is_member(uuid) to authenticated, service_role;

create table if not exists vaporize_next.clients (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references vaporize_next.organizations(id) on delete restrict,
 name text not null check (length(btrim(name))>0),
 phone text,
 notes text,
 created_at timestamptz not null default now(),
 unique (id,organization_id)
);
create table if not exists vaporize_next.vehicles (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references vaporize_next.organizations(id) on delete restrict,
 client_id uuid not null,
 brand text not null,
 model text not null,
 plate text,
 created_at timestamptz not null default now(),
 constraint next_vehicle_client_same_org foreign key(client_id,organization_id)
 references vaporize_next.clients(id,organization_id) on delete restrict
);
create index if not exists next_clients_org_idx on vaporize_next.clients(organization_id);
create index if not exists next_vehicles_org_idx on vaporize_next.vehicles(organization_id,client_id);

alter table vaporize_next.organizations enable row level security;
alter table vaporize_next.memberships enable row level security;
alter table vaporize_next.clients enable row level security;
alter table vaporize_next.vehicles enable row level security;

create policy next_org_read on vaporize_next.organizations for select to authenticated
 using (vaporize_next.is_member(id));
create policy next_membership_read on vaporize_next.memberships for select to authenticated
 using (vaporize_next.is_member(organization_id));
create policy next_clients_read on vaporize_next.clients for select to authenticated
 using (vaporize_next.is_member(organization_id));
create policy next_vehicles_read on vaporize_next.vehicles for select to authenticated
 using (vaporize_next.is_member(organization_id));

-- No client-side writes until role-scoped permissions are tested.
grant select on vaporize_next.organizations, vaporize_next.memberships,
 vaporize_next.clients, vaporize_next.vehicles to authenticated;
grant all on all tables in schema vaporize_next to service_role;
