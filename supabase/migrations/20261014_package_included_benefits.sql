-- Vaporeasy V2: benefits contracted per vehicle/plan, separate from executions and billing.
-- Safe additive migration. No charges, appointments or historical execution rows are modified.
create table public.package_included_benefits (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.package_subscriptions(id),
  service_label text not null check(length(btrim(service_label)) between 3 and 120),
  frequency text not null check(frequency in ('monthly','per_visit')),
  monthly_quantity integer not null default 1 check(monthly_quantity between 1 and 12),
  effective_from_month date not null check(extract(day from effective_from_month)=1),
  retired_from_month date check(retired_from_month is null or
    (extract(day from retired_from_month)=1 and retired_from_month>=effective_from_month)),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index package_included_benefits_version_uq
  on public.package_included_benefits(subscription_id,lower(service_label),effective_from_month);
create index package_included_benefits_subscription_month_idx
  on public.package_included_benefits(subscription_id,effective_from_month);
alter table public.package_included_benefits enable row level security;
revoke all on public.package_included_benefits from public,anon,authenticated;
grant select on public.package_included_benefits to authenticated;
create policy package_included_benefits_admin_read on public.package_included_benefits
 for select to authenticated using (auth.uid() is not null and private.current_app_role() in ('owner','admin'));

create function public.add_package_included_benefit(
 p_subscription_id uuid,p_service_label text,p_frequency text,p_monthly_quantity integer,p_effective_from_month date)
 returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare s public.package_subscriptions; benefit_id uuid;
begin
 if auth.uid() is null or coalesce(private.current_app_role(),'') not in ('owner','admin') then
   raise exception using errcode='42501',message='Somente ADM pode definir benefícios incluídos.';
 end if;
 select * into s from public.package_subscriptions where id=p_subscription_id;
 if not found then raise exception 'Plano não encontrado.'; end if;
 if length(btrim(coalesce(p_service_label,''))) not between 3 and 120
    or p_frequency not in ('monthly','per_visit') or p_monthly_quantity not between 1 and 12
    or p_effective_from_month is null or extract(day from p_effective_from_month)<>1
    or p_effective_from_month < date_trunc('month',s.starts_on)::date then
   raise exception 'Informe benefício, periodicidade e mês de início válidos.';
 end if;
 if exists (select 1 from public.package_included_benefits b
            where b.subscription_id=s.id and lower(b.service_label)=lower(btrim(p_service_label))
              and b.effective_from_month<=p_effective_from_month
              and (b.retired_from_month is null or b.retired_from_month>p_effective_from_month)) then
   raise exception 'Este benefício já está previsto no plano para o mês informado.';
 end if;
 insert into public.package_included_benefits
   (subscription_id,service_label,frequency,monthly_quantity,effective_from_month,created_by)
 values(s.id,btrim(p_service_label),p_frequency,p_monthly_quantity,p_effective_from_month,auth.uid())
 returning id into benefit_id;
 return benefit_id;
end $$;

create function public.retire_package_included_benefit(p_benefit_id uuid,p_from_month date)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare b public.package_included_benefits;
begin
 if auth.uid() is null or coalesce(private.current_app_role(),'') not in ('owner','admin') then
   raise exception using errcode='42501',message='Somente ADM pode encerrar benefícios.';
 end if;
 select * into b from public.package_included_benefits where id=p_benefit_id for update;
 if not found then raise exception 'Benefício não encontrado.'; end if;
 if p_from_month is null or extract(day from p_from_month)<>1
   or p_from_month < b.effective_from_month
   or p_from_month < date_trunc('month',(now() at time zone 'America/Sao_Paulo')::date)::date then
   raise exception 'O encerramento só pode começar no mês atual ou em mês futuro.';
 end if;
 update public.package_included_benefits
  set retired_from_month=p_from_month
  where id=b.id and (retired_from_month is null or retired_from_month>p_from_month);
 return p_benefit_id;
end $$;
revoke all on function public.add_package_included_benefit(uuid,text,text,integer,date) from public,anon;
revoke all on function public.retire_package_included_benefit(uuid,date) from public,anon;
grant execute on function public.add_package_included_benefit(uuid,text,text,integer,date) to authenticated;
grant execute on function public.retire_package_included_benefit(uuid,date) to authenticated;
