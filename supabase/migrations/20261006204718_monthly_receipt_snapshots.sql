create table if not exists public.monthly_receipt_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  competence_month date not null,
  snapshot jsonb not null,
  issued_by uuid not null references auth.users(id) on delete restrict,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint monthly_receipt_snapshots_competence_month_check
    check (competence_month = date_trunc('month', competence_month::timestamptz)::date),
  constraint monthly_receipt_snapshots_snapshot_object_check
    check (jsonb_typeof(snapshot) = 'object'::text),
  constraint monthly_receipt_snapshots_client_month_key
    unique (client_id, competence_month)
);

alter table public.monthly_receipt_snapshots enable row level security;

revoke all on table public.monthly_receipt_snapshots from anon, authenticated;
grant select, insert on table public.monthly_receipt_snapshots to authenticated;

create policy monthly_receipt_snapshots_select
on public.monthly_receipt_snapshots
for select
to authenticated
using (
  private.is_active_user()
  and private.current_app_role() = any (array['owner'::text,'admin'::text])
);

create policy monthly_receipt_snapshots_insert
on public.monthly_receipt_snapshots
for insert
to authenticated
with check (
  private.is_active_user()
  and private.current_app_role() = any (array['owner'::text,'admin'::text])
  and issued_by = (select auth.uid())
);
