-- Vaporize Next: read-only membership authorization for the current JWT user.
-- The RPC lives in public because the custom schema is not assumed exposed via PostgREST.
create or replace function public.vaporize_next_my_organizations()
returns table(organization_id uuid, organization_name text, membership_role text)
language sql stable security definer
set search_path = ''
as $$
  select o.id, o.name, m.role
  from vaporize_next.memberships m
  join vaporize_next.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and o.status = 'active'
  order by o.name, o.id;
$$;
revoke all on function public.vaporize_next_my_organizations() from public, anon;
grant execute on function public.vaporize_next_my_organizations() to authenticated, service_role;
