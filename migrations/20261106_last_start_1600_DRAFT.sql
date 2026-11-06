-- DRAFT: apply only after isolated integration tests.
-- Database-wide guard, including direct writes, RPCs and recurring materialization.
create or replace function public.enforce_last_appointment_start()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare v_local_time time;
begin
  if tg_table_name = 'appointments' then
    if tg_op = 'UPDATE' and new.starts_at is not distinct from old.starts_at then
      return new; -- preserve historical late bookings on non-time edits
    end if;
    v_local_time := (new.starts_at at time zone 'America/Sao_Paulo')::time;
  elsif tg_table_name = 'recurring_plans' then
    if tg_op = 'UPDATE' and new.local_time is not distinct from old.local_time then
      return new;
    end if;
    v_local_time := new.local_time;
  else
    raise exception 'Unsupported schedule table';
  end if;
  if v_local_time > time '16:00:00' then
    raise exception using errcode='23514',
      message='O último horário permitido para iniciar um atendimento é 16h00.';
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_last_start_guard on public.appointments;
create trigger appointments_last_start_guard
before insert or update of starts_at on public.appointments
for each row execute function public.enforce_last_appointment_start();
drop trigger if exists recurring_plans_last_start_guard on public.recurring_plans;
create trigger recurring_plans_last_start_guard
before insert or update of local_time on public.recurring_plans
for each row execute function public.enforce_last_appointment_start();
