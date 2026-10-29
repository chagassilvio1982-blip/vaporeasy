-- Vaporize Next migration 0005: controlled client INSERT
-- APPLIED TO DEDICATED HOMOLOGATION ONLY on 2026-10-29 via Supabase migration\n-- vaporize_next_0005_clients_insert_owner_manager. A/B JWT tests remain pending.\n-- Do not replay this file manually: CREATE POLICY is not idempotent.
-- Scope: vaporize_next schema in dedicated homologation project only.
-- Requires migration 0001 and public.vaporize_next_my_organizations RPC (0002).
--
-- SECURITY: use a security-definer role predicate with fixed search_path to
-- avoid depending on the caller's RLS visibility into memberships.
-- The predicate checks auth.uid() and active organization membership.
begin;

create or replace function vaporize_next.can_manage_clients(p_organization_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vaporize_next.memberships m
    join vaporize_next.organizations o on o.id = m.organization_id
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner', 'manager')
      and o.status = 'active'
  );
$$;
revoke all on function vaporize_next.can_manage_clients(uuid) from public, anon;
grant execute on function vaporize_next.can_manage_clients(uuid) to authenticated, service_role;

-- Only the three client-editable fields are granted for INSERT.
grant insert (organization_id, name, phone) on vaporize_next.clients to authenticated;

create policy next_clients_insert_owner_manager
on vaporize_next.clients
for insert to authenticated
with check (vaporize_next.can_manage_clients(organization_id));

commit;
