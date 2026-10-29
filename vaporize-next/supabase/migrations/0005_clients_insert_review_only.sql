-- Vaporize Next migration 0005: controlled client INSERT
-- REVIEW ONLY: do not apply until isolated Supabase permissions and A/B tests are approved.
-- This migration affects only schema vaporize_next in the dedicated homologation project.
begin;

-- Insert privilege is necessary in addition to RLS; only authenticated users.
grant insert (organization_id, name, phone) on vaporize_next.clients to authenticated;

-- Owners and managers may insert only into their own active organization.
-- The existing memberships read policy does not authorize writing.
create policy next_clients_insert_owner_manager
on vaporize_next.clients
for insert to authenticated
with check (
  exists (
    select 1
    from vaporize_next.memberships m
    join vaporize_next.organizations o on o.id = m.organization_id
    where m.organization_id = clients.organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner', 'manager')
      and o.status = 'active'
  )
);

commit;
