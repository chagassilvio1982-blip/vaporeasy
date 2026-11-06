-- Execute only against disposable PostgreSQL CI database.
create schema if not exists private;
create table public.appointments (
 id integer generated always as identity primary key,
 starts_at timestamptz not null,
 schedule_override boolean not null default false,
 notes text
);
create table public.recurring_plans (
 id integer generated always as identity primary key,
 local_time time not null,
 notes text
);
\i migrations/20261106_last_start_1600_DRAFT.sql
do $$
declare v_id integer; v_failed boolean;
begin
 insert into public.appointments(starts_at) values ('2026-11-09 16:00:00-03') returning id into v_id;
 update public.appointments set notes='ordinary edit' where id=v_id;
 v_failed:=false;
 begin
  insert into public.appointments(starts_at) values ('2026-11-09 16:20:00-03');
 exception when check_violation then v_failed:=true; end;
 if not v_failed then raise exception '16:20 ordinary appointment was accepted'; end if;
 insert into public.appointments(starts_at,schedule_override) values ('2026-11-09 16:20:00-03',true);
 insert into public.recurring_plans(local_time) values ('16:00');
 v_failed:=false;
 begin
  insert into public.recurring_plans(local_time) values ('16:20');
 exception when check_violation then v_failed:=true; end;
 if not v_failed then raise exception '16:20 recurrence was accepted'; end if;
 -- Historical late appointments remain editable without rescheduling.
 alter table public.appointments disable trigger appointments_z_last_start_1600;
 insert into public.appointments(starts_at) values ('2026-11-09 17:00:00-03') returning id into v_id;
 alter table public.appointments enable trigger appointments_z_last_start_1600;
 update public.appointments set notes='historical note' where id=v_id;
 v_failed:=false;
 begin
  update public.appointments set starts_at='2026-11-09 17:20:00-03' where id=v_id;
 exception when check_violation then v_failed:=true; end;
 if not v_failed then raise exception 'Late rescheduling was accepted'; end if;
end $$;
