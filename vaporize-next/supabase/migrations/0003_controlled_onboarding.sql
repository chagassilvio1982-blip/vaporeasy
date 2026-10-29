-- Vaporize Next: controlled first-organization onboarding.
-- Only authenticated users, at most one organization per user.
-- All operational tables remain read-only from the browser.
create or replace function public.vaporize_next_create_organization(
  p_name text,
  p_slug text
)
returns table(organization_id uuid, organization_name text, membership_role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_name text := btrim(p_name);
  v_slug text := lower(btrim(p_slug));
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if v_name is null or length(v_name) not between 2 and 160 then
    raise exception 'Invalid organization name' using errcode = '22023';
  end if;
  if v_slug is null or length(v_slug) not between 3 and 60 or
     v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Invalid organization slug' using errcode = '22023';
  end if;
  -- Serialize onboarding attempts for this identity.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  if exists (select 1 from vaporize_next.memberships where user_id = v_user) then
    raise exception 'Organization already assigned' using errcode = '23505';
  end if;
  insert into vaporize_next.organizations(name,slug)
    values (v_name,v_slug) returning id into v_id;
  insert into vaporize_next.memberships(organization_id,user_id,role,status)
    values (v_id,v_user,'owner','active');
  return query select v_id,v_name,'owner'::text;
end;
$$;
revoke all on function public.vaporize_next_create_organization(text,text) from public, anon;
grant execute on function public.vaporize_next_create_organization(text,text) to authenticated, service_role;
