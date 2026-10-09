-- Internal pilot only. No references to billing, services or public booking.
create table public.internal_special_care (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 120),
 description text not null default '',
 materials text not null default '',
 material_cost numeric(12,2) check (material_cost >= 0),
 minutes numeric(10,2) check (minutes >= 0),
 active boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.internal_special_care enable row level security;
revoke all on public.internal_special_care from anon, authenticated;
grant select, insert, update on public.internal_special_care to authenticated;
create policy care_management on public.internal_special_care for all to authenticated
 using ((select private.current_app_role()) in ('owner','admin'))
 with check ((select private.current_app_role()) in ('owner','admin'));

create table public.internal_care_simulations (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 120),
 assumptions jsonb not null check (jsonb_typeof(assumptions) = 'object'),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now()
);
alter table public.internal_care_simulations enable row level security;
revoke all on public.internal_care_simulations from anon, authenticated;
grant select, insert on public.internal_care_simulations to authenticated;
create policy simulations_read on public.internal_care_simulations for select to authenticated
 using ((select private.current_app_role()) in ('owner','admin'));
create policy simulations_create on public.internal_care_simulations for insert to authenticated
 with check ((select private.current_app_role()) in ('owner','admin') and created_by = (select auth.uid()));

insert into public.internal_special_care(name,description) values
 ('Enceramento manual','Acabamento e proteção da pintura.'),
 ('Proteção hidrorrepelente dos vidros','Tratamento dos vidros definidos para o atendimento.'),
 ('Higienização dos bancos','Limpeza aprofundada conforme material e condição dos bancos.'),
 ('Limpeza e hidratação do couro','Limpeza específica e tratamento do couro.'),
 ('Tratamento com ozônio','Tratamento complementar, sujeito à avaliação e procedimento adequado.');
