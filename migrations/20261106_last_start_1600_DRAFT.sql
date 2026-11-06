-- DRAFT ONLY: not deployed. Enforce default last start at the database boundary.
-- Exceptional one-time appointments must pass the existing authorized override guard.
-- This trigger must be installed after private.guard_schedule_override on INSERT.
create or replace function private.guard_last_start_1600()
returns trigger language plpgsql
set search_path = pg_catalog, public, private
as $$
declare v_time time;
begin
  if tg_table_name='appointments' then
    if tg_op='UPDATE' and new.starts_at is not distinct from old.starts_at then return new; end if;
    v_time := (new.starts_at at time zone 'America/Sao_Paulo')::time;
    if v_time>time '16:00' and not coalesce(new.schedule_override,false) then
      raise exception using errcode='23514',message='Início após 16h exige encaixe autorizado.';
    end if;
  elsif tg_table_name='recurring_plans' then
    if tg_op='UPDATE' and new.local_time is not distinct from old.local_time then return new; end if;
    v_time := new.local_time;
    if v_time>time '16:00' then
      raise exception using errcode='23514',message='Recorrência após 16h não permitida; use encaixe pontual autorizado.';
    end if;
  end if;
  return new;
end;
$$;
-- The existing appointments_override_guard trigger sets schedule_override first.
-- Use trigger name alphabetically AFTER appointments_override_guard.
drop trigger if exists appointments_z_last_start_1600 on public.appointments;
create trigger appointments_z_last_start_1600
before insert or update of starts_at on public.appointments
for each row execute function private.guard_last_start_1600();
drop trigger if exists recurring_plans_z_last_start_1600 on public.recurring_plans;
create trigger recurring_plans_z_last_start_1600
before insert or update of local_time on public.recurring_plans
for each row execute function private.guard_last_start_1600();
