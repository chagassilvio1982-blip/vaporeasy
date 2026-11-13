-- Disposable PostgreSQL only. Stub auth and application schema for receipt integration.
create role authenticated;
create role anon;
create schema if not exists auth;
create schema if not exists private;
create function auth.uid() returns uuid language sql stable as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create function private.is_active_user() returns boolean language sql stable as $$ select true $$;
create function private.current_app_role() returns text language sql stable as $$ select 'owner'::text $$;
create table public.clients(id uuid primary key,name text not null default 'Cliente de teste');
create table public.vehicles(id uuid primary key,client_id uuid not null,brand text,model text,plate text);
create table public.services(id uuid primary key,name text not null);
create table public.package_charges(id uuid primary key,subscription_id uuid,client_id uuid,vehicle_id uuid,service_id uuid,competence_month date,status text,amount numeric);
create table public.appointments(id uuid primary key,client_id uuid,vehicle_id uuid,service_id uuid,starts_at timestamptz,status text,deleted_at timestamptz,recurring_plan_id uuid,final_value numeric);
create table public.appointment_payments(appointment_id uuid,status text);
create table public.appointment_financial_corrections(id uuid primary key default gen_random_uuid(),appointment_id uuid not null unique,client_id uuid not null,original_base_value numeric not null,corrected_base_value numeric not null,corrected_final_value numeric not null,classification text not null,reason text not null,created_at timestamptz not null default now(),created_by uuid);
create table public.package_subscriptions(
 id uuid primary key default gen_random_uuid(),
 client_id uuid,vehicle_id uuid,service_id uuid,starts_on date,superseded_at timestamptz,
 recurring_plan_id uuid,active boolean default true,scheduled_effective_on date,replaces_subscription_id uuid
);

create table public.monthly_receipt_snapshots(id uuid primary key default gen_random_uuid(),client_id uuid,competence_month date,snapshot jsonb,issued_by uuid,issued_at timestamptz default now(),unique(client_id,competence_month));
\i migrations/20261106_selected_monthly_receipt_DRAFT.sql
-- Anonymous users must never receive EXECUTE permission, including after reruns.
select 1 / (case when not has_function_privilege('anon','public.issue_selected_monthly_receipt(uuid,date,jsonb)','EXECUTE') and has_function_privilege('authenticated','public.issue_selected_monthly_receipt(uuid,date,jsonb)','EXECUTE') then 1 else 0 end) as role_permissions_valid;
-- Applying the migration again must not fail or discard existing billing documents.
\i migrations/20261106_selected_monthly_receipt_DRAFT.sql
insert into public.clients(id,name) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Cliente A');
insert into public.package_subscriptions(id,client_id,vehicle_id,service_id,starts_on)
values ('a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2','a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3','2026-10-01');
insert into public.package_charges values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2','a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3','2026-11-01','pending',390);
insert into public.vehicles values
 ('a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','BMW','X5','ABC1D23'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Porsche','Cayman','DEF4G56');
insert into public.services values
 ('a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3','Plano Plus'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Estética avulsa');
insert into public.appointments values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dddddddd-dddd-4ddd-8ddd-dddddddddddd','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','2026-11-05 10:00-03','completed',null,null,150);
do $$
declare v_id uuid; v_failed boolean; v_lines jsonb;
begin
 v_lines:='[{"kind":"package_charge","id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","amount":390},{"kind":"appointment_extra","id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","amount":150}]'::jsonb;
 v_id:=public.issue_selected_monthly_receipt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-11-01',v_lines);
 if (select (snapshot->>'total')::numeric from public.monthly_billing_documents where id=v_id)<>540 then raise exception 'Wrong receipt total';end if;
 if (select snapshot->>'client_name' from public.monthly_billing_documents where id=v_id)<>'Cliente A' then raise exception 'Client name missing from immutable snapshot'; end if;
 if (select snapshot->'lines'->0->>'vehicle_label' from public.monthly_billing_documents where id=v_id)<>'BMW X5 • ABC1D23' then raise exception 'Package vehicle label missing from immutable snapshot'; end if;
 if (select snapshot->'lines'->1->>'service_label' from public.monthly_billing_documents where id=v_id)<>'Estética avulsa' then raise exception 'Appointment service label missing from immutable snapshot'; end if;
 if (select snapshot->>'schema_version' from public.monthly_billing_documents where id=v_id)<>'3' then raise exception 'Unexpected snapshot schema version'; end if;
 v_failed:=false;
 begin perform public.issue_selected_monthly_receipt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-11-01',v_lines);
 exception when others then v_failed:=true;end;
 if not v_failed then raise exception 'Duplicate receipt allowed';end if;
 if (select count(*) from public.monthly_billing_documents)<>1 then raise exception 'Duplicate row created';end if;
 if exists(select 1 from public.monthly_receipt_snapshots) then raise exception 'Unpaid billing document contaminated paid receipt history';end if;
 if (select status from public.package_charges limit 1)<>'pending' then raise exception 'Charge status modified';end if;
 if exists(select 1 from public.appointment_payments) then raise exception 'Payment record created';end if;
end $$;

-- Repeated installation must not reintroduce anonymous EXECUTE privileges.
select 1 / (case when not has_function_privilege('anon','public.issue_selected_monthly_receipt(uuid,date,jsonb)','EXECUTE') then 1 else 0 end) as rerun_permissions_valid;

-- Legacy receipt for a different client must block the new document.
insert into public.clients(id,name) values ('10101010-1010-4010-8010-101010101010','Cliente legado');
insert into public.package_subscriptions(id,client_id,vehicle_id,service_id,starts_on)
values ('21212121-2121-4212-8212-212121212121','10101010-1010-4010-8010-101010101010','22222222-2222-4222-8222-222222222223','23232323-2323-4232-8232-232323232323','2026-10-01');
insert into public.package_charges values ('20202020-2020-4020-8020-202020202020','21212121-2121-4212-8212-212121212121','10101010-1010-4010-8010-101010101010','22222222-2222-4222-8222-222222222223','23232323-2323-4232-8232-232323232323','2026-11-01','pending',390);
insert into public.vehicles values ('22222222-2222-4222-8222-222222222223','10101010-1010-4010-8010-101010101010','Audi','Q5','GHI7J89');
insert into public.services values ('23232323-2323-4232-8232-232323232323','Plano Essencial');
insert into public.monthly_receipt_snapshots(client_id,competence_month,snapshot,issued_by)
values ('10101010-1010-4010-8010-101010101010','2026-11-01','{}'::jsonb,'11111111-1111-4111-8111-111111111111');
do $legacy$
declare v_rejected boolean := false;
begin
 begin
  perform public.issue_selected_monthly_receipt('10101010-1010-4010-8010-101010101010','2026-11-01',
   '[{"kind":"package_charge","id":"20202020-2020-4020-8020-202020202020","amount":390}]'::jsonb);
 exception when others then v_rejected:=true;
 end;
 if not v_rejected then raise exception 'Legacy receipt did not block duplicate billing'; end if;
 if exists(select 1 from public.monthly_billing_documents where client_id='10101010-1010-4010-8010-101010101010') then
  raise exception 'Duplicate document created despite legacy receipt';
 end if;
end $legacy$;

-- Negative cases use a separate client/month to avoid hitting the existing-receipt guard.
insert into public.clients(id,name) values ('ffffffff-ffff-4fff-8fff-ffffffffffff','Cliente teste negativo');
insert into public.package_subscriptions(id,client_id,vehicle_id,service_id,starts_on)
values ('29292929-2929-4929-8929-292929292929','ffffffff-ffff-4fff-8fff-ffffffffffff','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','2026-10-01');
insert into public.package_charges values ('22222222-2222-4222-8222-222222222222','29292929-2929-4929-8929-292929292929','ffffffff-ffff-4fff-8fff-ffffffffffff','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','2026-11-01','paid',390);
insert into public.vehicles values
 ('44444444-4444-4444-8444-444444444444','ffffffff-ffff-4fff-8fff-ffffffffffff','Mercedes','C-Class','JKL1M23'),
 ('77777777-7777-4777-8777-777777777777','ffffffff-ffff-4fff-8fff-ffffffffffff','Porsche','911','NOP4Q56');
insert into public.services values
 ('55555555-5555-4555-8555-555555555555','Plano Premium'),
 ('88888888-8888-4888-8888-888888888888','Estética avulsa');
insert into public.appointments values
 ('33333333-3333-4333-8333-333333333333','ffffffff-ffff-4fff-8fff-ffffffffffff','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','2026-11-07 10:00-03','completed',null,null,150),
 ('66666666-6666-4666-8666-666666666666','ffffffff-ffff-4fff-8fff-ffffffffffff','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888','2026-11-08 10:00-03','completed',null,'99999999-9999-4999-8999-999999999999',150);
insert into public.appointment_payments values ('33333333-3333-4333-8333-333333333333','paid');
do $$
declare v_failed boolean; v_lines jsonb;
begin
 v_lines:='[{"kind":"package_charge","id":"22222222-2222-4222-8222-222222222222","amount":390}]';
 v_failed:=false;
 begin perform public.issue_selected_monthly_receipt('ffffffff-ffff-4fff-8fff-ffffffffffff','2026-11-01',v_lines);
 exception when others then v_failed:=true;end;
 if not v_failed then raise exception 'Paid package charge was accepted';end if;
 v_lines:='[{"kind":"appointment_extra","id":"33333333-3333-4333-8333-333333333333","amount":150}]';
 v_failed:=false;
 begin perform public.issue_selected_monthly_receipt('ffffffff-ffff-4fff-8fff-ffffffffffff','2026-11-01',v_lines);
 exception when others then v_failed:=true;end;
 if not v_failed then raise exception 'Paid appointment was accepted';end if;
 v_lines:='[{"kind":"appointment_extra","id":"66666666-6666-4666-8666-666666666666","amount":150}]';
 v_failed:=false;
 begin perform public.issue_selected_monthly_receipt('ffffffff-ffff-4fff-8fff-ffffffffffff','2026-11-01',v_lines);
 exception when others then v_failed:=true;end;
 if not v_failed then raise exception 'Plan-linked appointment was accepted';end if;
 v_lines:='[{"kind":"appointment_extra","id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","amount":150}]';
 v_failed:=false;
 begin perform public.issue_selected_monthly_receipt('ffffffff-ffff-4fff-8fff-ffffffffffff','2026-11-01',v_lines);
 exception when others then v_failed:=true;end;
 if not v_failed then raise exception 'Another client appointment was accepted';end if;
 v_lines:='[{"kind":"appointment_extra","id":"33333333-3333-4333-8333-333333333333","amount":149}]';
 v_failed:=false;
 begin perform public.issue_selected_monthly_receipt('ffffffff-ffff-4fff-8fff-ffffffffffff','2026-11-01',v_lines);
 exception when others then v_failed:=true;end;
 if not v_failed then raise exception 'Altered amount was accepted';end if;
 v_lines:='[{"kind":"package_charge","id":"22222222-2222-4222-8222-222222222222","amount":390},{"kind":"package_charge","id":"22222222-2222-4222-8222-222222222222","amount":390}]';
 v_failed:=false;
 begin perform public.issue_selected_monthly_receipt('ffffffff-ffff-4fff-8fff-ffffffffffff','2026-11-01',v_lines);
 exception when others then v_failed:=true;end;
 if not v_failed then raise exception 'Duplicate item was accepted';end if;
 if (select count(*) from public.monthly_billing_documents)<>1 then raise exception 'Invalid receipt was inserted';end if;
end $$;

-- Explicit avulso correction must override recurring-plan and subscription coverage.
insert into public.clients(id,name) values ('abababab-abab-4bab-8bab-abababababab','Cliente avulso');
insert into public.vehicles values ('dededede-dede-4ede-8ede-dededededede','abababab-abab-4bab-8bab-abababababab','Porsche','Cayman','RST7U89');
insert into public.services values ('efefefef-efef-4fef-8fef-efefefefefef','Estética avulsa');
insert into public.appointments values ('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','abababab-abab-4bab-8bab-abababababab','dededede-dede-4ede-8ede-dededededede','efefefef-efef-4fef-8fef-efefefefefef','2026-11-10 10:00-03','completed',null,'12121212-1212-4212-8212-121212121212',390);
insert into public.package_subscriptions(client_id,vehicle_id,service_id,starts_on,superseded_at)
values ('abababab-abab-4bab-8bab-abababababab','dededede-dede-4ede-8ede-dededededede','efefefef-efef-4fef-8fef-efefefefefef','2026-10-01',null);
insert into public.appointment_financial_corrections(appointment_id,client_id,original_base_value,corrected_base_value,corrected_final_value,classification,reason) values ('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','abababab-abab-4bab-8bab-abababababab',390,150,150,'avulso','Integration test');
do $$ declare v_doc uuid; begin
 v_doc:=public.issue_selected_monthly_receipt('abababab-abab-4bab-8bab-abababababab','2026-11-01','[{"kind":"appointment_extra","id":"cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd","amount":150}]'::jsonb);
 if (select (snapshot->>'total')::numeric from public.monthly_billing_documents where id=v_doc) <> 150 then raise exception 'Corrected avulso amount ignored'; end if;
end $$;

-- A correction explicitly classified as plan is never billable as an appointment extra.
insert into public.clients(id,name) values ('acacacac-acac-4cac-8cac-acacacacacac','Cliente classificação plano');
insert into public.appointments values ('adadadad-adad-4dad-8dad-adadadadadad','acacacac-acac-4cac-8cac-acacacacacac','dededede-dede-4ede-8ede-dededededede','efefefef-efef-4fef-8fef-efefefefefef','2026-11-11 10:00-03','completed',null,null,390);
insert into public.appointment_financial_corrections(appointment_id,client_id,original_base_value,corrected_base_value,corrected_final_value,classification,reason) values ('adadadad-adad-4dad-8dad-adadadadadad','acacacac-acac-4cac-8cac-acacacacacac',390,390,390,'plan','Integration test plan classification');
do $$ declare v_failed boolean := false; begin
 begin
  perform public.issue_selected_monthly_receipt('acacacac-acac-4cac-8cac-acacacacacac','2026-11-01','[{"kind":"appointment_extra","id":"adadadad-adad-4dad-8dad-adadadadadad","amount":390}]'::jsonb);
 exception when others then v_failed := true;
 end;
 if not v_failed then raise exception 'Plan-classified correction was accepted as avulso'; end if;
 if exists(select 1 from public.monthly_billing_documents where client_id='acacacac-acac-4cac-8cac-acacacacacac') then raise exception 'Plan-classified appointment created a billing document'; end if;
end $$;

-- An old subscription stops covering the old service after its scheduled replacement date.
insert into public.clients(id,name) values ('bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc','Cliente substituição');
insert into public.vehicles values ('b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3','bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc','BMW','X3','VWX1Y23');
insert into public.services values
 ('b4b4b4b4-b4b4-44b4-84b4-b4b4b4b4b4b4','Serviço antigo'),
 ('b5b5b5b5-b5b5-45b5-85b5-b5b5b5b5b5b5','Serviço novo');
insert into public.appointments values ('bdbdbdbd-bdbd-4dbd-8dbd-bdbdbdbdbdbd','bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc','b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3','b4b4b4b4-b4b4-44b4-84b4-b4b4b4b4b4b4','2026-11-10 10:00-03','completed',null,null,150);
insert into public.package_subscriptions(id,client_id,vehicle_id,service_id,starts_on,recurring_plan_id,active)
values ('bebebebe-bebe-4ebe-8ebe-bebebebebebe','bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc','b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3','b4b4b4b4-b4b4-44b4-84b4-b4b4b4b4b4b4','2026-10-01','c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0',false);
insert into public.package_subscriptions(id,client_id,vehicle_id,service_id,starts_on,recurring_plan_id,active,scheduled_effective_on,replaces_subscription_id)
values ('bfbfbfbf-bfbf-4fbf-8fbf-bfbfbfbfbfbf','bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc','b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3','b5b5b5b5-b5b5-45b5-85b5-b5b5b5b5b5b5','2026-11-05','c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2',true,'2026-11-05','bebebebe-bebe-4ebe-8ebe-bebebebebebe');
do $$ declare v_doc uuid; begin
 v_doc:=public.issue_selected_monthly_receipt('bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc','2026-11-01','[{"kind":"appointment_extra","id":"bdbdbdbd-bdbd-4dbd-8dbd-bdbdbdbdbdbd","amount":150}]'::jsonb);
 if (select (snapshot->>'total')::numeric from public.monthly_billing_documents where id=v_doc) <> 150 then raise exception 'Old subscription incorrectly blocked post-replacement avulso'; end if;
end $$;
