-- Disposable PostgreSQL only. Stub auth and application schema for receipt integration.
create role authenticated;
create schema if not exists auth;
create schema if not exists private;
create function auth.uid() returns uuid language sql stable as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create function private.is_active_user() returns boolean language sql stable as $$ select true $$;
create function private.current_app_role() returns text language sql stable as $$ select 'owner'::text $$;
create table public.clients(id uuid primary key);
create table public.package_charges(id uuid primary key, client_id uuid, competence_month date, status text, amount numeric);
create table public.appointments(id uuid primary key,client_id uuid,vehicle_id uuid,service_id uuid,starts_at timestamptz,status text,deleted_at timestamptz,recurring_plan_id uuid,final_value numeric);
create table public.appointment_payments(appointment_id uuid,status text);
create table public.package_subscriptions(client_id uuid,vehicle_id uuid,service_id uuid,starts_on date,superseded_at timestamptz);
create table public.monthly_receipt_snapshots(id uuid primary key default gen_random_uuid(),client_id uuid,competence_month date,snapshot jsonb,issued_by uuid,issued_at timestamptz default now(),unique(client_id,competence_month));
\i migrations/20261106_selected_monthly_receipt_DRAFT.sql
insert into public.clients values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.package_charges values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-11-01','pending',390);
insert into public.appointments values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dddddddd-dddd-4ddd-8ddd-dddddddddddd','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','2026-11-05 10:00-03','completed',null,null,150);
do $$
declare v_id uuid; v_failed boolean; v_lines jsonb;
begin
 v_lines:='[{"kind":"package_charge","id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","amount":390},{"kind":"appointment_extra","id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","amount":150}]'::jsonb;
 v_id:=public.issue_selected_monthly_receipt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-11-01',v_lines);
 if (select (snapshot->>'total')::numeric from public.monthly_receipt_snapshots where id=v_id)<>540 then raise exception 'Wrong receipt total';end if;
 v_failed:=false;
 begin perform public.issue_selected_monthly_receipt('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-11-01',v_lines);
 exception when others then v_failed:=true;end;
 if not v_failed then raise exception 'Duplicate receipt allowed';end if;
 if (select count(*) from public.monthly_receipt_snapshots)<>1 then raise exception 'Duplicate row created';end if;
 if (select status from public.package_charges limit 1)<>'pending' then raise exception 'Charge status modified';end if;
 if exists(select 1 from public.appointment_payments) then raise exception 'Payment record created';end if;
end $$;

-- Negative cases use a separate client/month to avoid hitting the existing-receipt guard.
insert into public.clients values ('ffffffff-ffff-4fff-8fff-ffffffffffff');
insert into public.package_charges values ('22222222-2222-4222-8222-222222222222','ffffffff-ffff-4fff-8fff-ffffffffffff','2026-11-01','paid',390);
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
 if (select count(*) from public.monthly_receipt_snapshots)<>1 then raise exception 'Invalid receipt was inserted';end if;
end $$;
