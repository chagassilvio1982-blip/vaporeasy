-- Vaporeasy V2: orçamento por necessidade do RG (revisada em homologação e produção).
-- Valores ficam fora do JSON de diagnósticos porque operadores podem ler esse JSON.
-- Sem trigger financeiro: criar/editar orçamento NÃO gera atendimento, cobrança ou recebível.
create table if not exists public.vehicle_service_quotes (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id),
  issue_id text not null check (char_length(issue_id) between 0 and 80 and issue_id <> ''),
  amount numeric(12,2) check (amount is null or (amount >= 0 and amount <= 1000000)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_service_quotes_one_per_issue unique (vehicle_id,issue_id)
);

alter table public.vehicle_service_quotes enable row level security;
revoke all on table public.vehicle_service_quotes from public, anon, authenticated;
grant select,insert,update on table public.vehicle_service_quotes to authenticated;

create policy vehicle_service_quotes_read_admin
on public.vehicle_service_quotes for select to authenticated
using (private.current_app_role() in ('owner','admin'));

create policy vehicle_service_quotes_insert_admin
on public.vehicle_service_quotes for insert to authenticated
with check (private.current_app_role() in ('owner','admin'));

create policy vehicle_service_quotes_update_admin
on public.vehicle_service_quotes for update to authenticated
using (private.current_app_role() in ('owner','admin'))
with check (private.current_app_role() in ('owner','admin'));

comment on table public.vehicle_service_quotes is 'Orçamentos internos por necessidade do RG; não representam recebível ou serviço executado.';
