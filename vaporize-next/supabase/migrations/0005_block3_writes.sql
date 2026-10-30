-- Applied to isolated Supabase homologation project cfpvexgkjsqpwhebsoos on 2026-10-30.
-- Apply once; policies use IF NOT EXISTS via catalog checks to permit safe replay.
grant insert, update on vaporize_next.vehicles to authenticated;
grant update on vaporize_next.clients to authenticated;
do $$
begin
 if not exists(select 1 from pg_policies where schemaname='vaporize_next' and tablename='vehicles' and policyname='next_vehicles_insert_owner_manager') then
  create policy next_vehicles_insert_owner_manager on vaporize_next.vehicles for insert to authenticated with check (vaporize_next.can_manage_clients(organization_id));
 end if;
 if not exists(select 1 from pg_policies where schemaname='vaporize_next' and tablename='vehicles' and policyname='next_vehicles_update_owner_manager') then
  create policy next_vehicles_update_owner_manager on vaporize_next.vehicles for update to authenticated using (vaporize_next.can_manage_clients(organization_id)) with check (vaporize_next.can_manage_clients(organization_id));
 end if;
 if not exists(select 1 from pg_policies where schemaname='vaporize_next' and tablename='clients' and policyname='next_clients_update_owner_manager') then
  create policy next_clients_update_owner_manager on vaporize_next.clients for update to authenticated using (vaporize_next.can_manage_clients(organization_id)) with check (vaporize_next.can_manage_clients(organization_id));
 end if;
end $$;
