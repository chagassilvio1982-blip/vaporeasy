-- Vaporeasy V2 Staging
-- Perfis internos: owner = Proprietário, admin = Gerente, operator = Colaborador.
-- Gerentes mantêm a operação; configurações estruturais ficam exclusivas de Proprietários.

drop policy if exists app_profiles_insert on public.app_profiles;
create policy app_profiles_insert
on public.app_profiles
for insert
to authenticated
with check (private.current_app_role() = 'owner');

drop policy if exists app_profiles_update on public.app_profiles;
create policy app_profiles_update
on public.app_profiles
for update
to authenticated
using (private.current_app_role() = 'owner')
with check (private.current_app_role() = 'owner');

drop policy if exists schedule_settings_write on public.schedule_settings;
create policy schedule_settings_write
on public.schedule_settings
for all
to authenticated
using (private.current_app_role() = 'owner')
with check (private.current_app_role() = 'owner');

drop policy if exists schedule_week_rules_write on public.schedule_week_rules;
create policy schedule_week_rules_write
on public.schedule_week_rules
for all
to authenticated
using (private.current_app_role() = 'owner')
with check (private.current_app_role() = 'owner');

drop policy if exists service_addon_compatibility_write on public.service_addon_compatibility;
create policy service_addon_compatibility_write
on public.service_addon_compatibility
for all
to authenticated
using (private.current_app_role() = 'owner')
with check (private.current_app_role() = 'owner');

drop policy if exists service_addon_rules_write on public.service_addon_rules;
create policy service_addon_rules_write
on public.service_addon_rules
for all
to authenticated
using (private.current_app_role() = 'owner')
with check (private.current_app_role() = 'owner');

drop policy if exists service_addons_write on public.service_addons;
create policy service_addons_write
on public.service_addons
for all
to authenticated
using (private.current_app_role() = 'owner')
with check (private.current_app_role() = 'owner');

drop policy if exists services_insert on public.services;
create policy services_insert
on public.services
for insert
to authenticated
with check (private.current_app_role() = 'owner');

drop policy if exists services_update on public.services;
create policy services_update
on public.services
for update
to authenticated
using (private.current_app_role() = 'owner')
with check (private.current_app_role() = 'owner');

drop policy if exists business_payment_settings_write on public.business_payment_settings;
create policy business_payment_settings_write
on public.business_payment_settings
for all
to authenticated
using (private.current_app_role() = 'owner')
with check (private.current_app_role() = 'owner');
