-- Vaporeasy: cadence configuration for plan tiers and subscribed vehicles.
-- Templates never create contractual benefits automatically.
-- Isolated homologation first; run against production only after approval.
create table public.plan_care_templates(
 id uuid primary key default gen_random_uuid(),
 plan_tier text not null check(plan_tier in ('essencial','plus','premium')),
 service_label text not null check(length(btrim(service_label)) between 3 and 120),
 cadence_type text not null check(cadence_type in ('interval_days','monthly','per_visit','every_n_visits')),
 min_days int check(min_days between 1 and 365),
 max_days int check(max_days between 1 and 365),
 every_n_visits int check(every_n_visits between 1 and 12),
 monthly_quantity int not null default 1 check(monthly_quantity between 1 and 12),
 guidance text not null default '' check(length(guidance)<=500),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint plan_care_templates_cadence_check check(
  (cadence_type='interval_days' and min_days is not null and max_days is not null and max_days>=min_days and every_n_visits is null)
  or (cadence_type='every_n_visits' and every_n_visits is not null and min_days is null and max_days is null)
  or (cadence_type in ('monthly','per_visit') and min_days is null and max_days is null and every_n_visits is null)
 )
);
create unique index plan_care_templates_key on public.plan_care_templates(plan_tier,lower(service_label));
alter table public.plan_care_templates enable row level security;
revoke all on public.plan_care_templates from public,anon,authenticated;
grant select on public.plan_care_templates to authenticated;
create policy plan_care_templates_read on public.plan_care_templates for select to authenticated
 using (auth.uid() is not null and private.current_app_role() in ('owner','admin'));

-- Administrative starting points. Informational templates only; NOT auto-added to any subscription.
insert into public.plan_care_templates(plan_tier,service_label,cadence_type,min_days,max_days,every_n_visits,monthly_quantity,guidance)
values
 ('essencial','Estética de manutenção','per_visit',null,null,null,1,'Atendimento básico conforme contratação. Contagem registrada na agenda.'),
 ('plus','Estética de manutenção','per_visit',null,null,null,1,'Atendimento conforme contratação.'),
 ('plus','Enceramento alternado','every_n_visits',null,null,2,1,'Modelo inicial: a cada duas visitas. Confirmar os cuidados incluídos com o cliente.'),
 ('premium','Estética de manutenção','per_visit',null,null,null,1,'Atendimento conforme contratação.'),
 ('premium','Enceramento manual','per_visit',null,null,null,1,'Verificar se foi incluído no plano deste veículo.'),
 ('premium','Proteção hidrorrepelente do para-brisa','interval_days',60,90,null,1,'Inspecionar uso e comportamento da água; antecipar ou adiar dentro da janela após avaliação.'),
 ('premium','Selante com grafeno da pintura','monthly',null,null,null,1,'Uma aplicação por mês, quando este tratamento estiver contratado.'),
 ('premium','Hidratação do couro','interval_days',60,60,null,1,'Aplicar apenas quando o veículo tiver couro e o serviço estiver contratado.');

alter table public.package_included_benefits
 add column cadence_min_days integer,
 add column cadence_max_days integer,
 add column every_n_visits integer;
alter table public.package_included_benefits
 drop constraint package_included_benefits_frequency_check;
alter table public.package_included_benefits
 add constraint package_included_benefits_frequency_check
 check(frequency in ('monthly','per_visit','interval_days','every_n_visits'));
alter table public.package_included_benefits
 add constraint package_included_benefits_cadence_check
 check(
 (frequency='interval_days' and cadence_min_days between 1 and 365 and cadence_max_days between cadence_min_days and 365 and every_n_visits is null)
 or (frequency='every_n_visits' and every_n_visits between 1 and 12 and cadence_min_days is null and cadence_max_days is null)
 or (frequency in ('monthly','per_visit') and cadence_min_days is null and cadence_max_days is null and every_n_visits is null)
 );

-- Explicit audit trail for subscription cadence edits; no charge, calendar, or visit mutation.
create table public.plan_care_rule_audit(
 id uuid primary key default gen_random_uuid(),
 benefit_id uuid not null references public.package_included_benefits(id),
 subscription_id uuid not null references public.package_subscriptions(id),
 previous_rule jsonb not null,
 new_rule jsonb not null,
 changed_by uuid not null references auth.users(id),
 changed_at timestamptz not null default now()
);
alter table public.plan_care_rule_audit enable row level security;
revoke all on public.plan_care_rule_audit from public,anon,authenticated;
grant select on public.plan_care_rule_audit to authenticated;
create policy plan_care_rule_audit_admin_read on public.plan_care_rule_audit for select to authenticated
 using (auth.uid() is not null and private.current_app_role() in ('owner','admin'));

create function public.save_plan_care_template(
 p_tier text,p_label text,p_type text,p_min int default null,p_max int default null,
 p_every int default null,p_quantity int default 1,p_guidance text default '',p_enabled boolean default true
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare result_id uuid;
begin
 if auth.uid() is null or private.current_app_role() not in ('owner','admin') then
  raise exception using errcode='42501',message='Somente o administrador pode ajustar os padrões.';
 end if;
 if p_tier not in ('essencial','plus','premium') or length(btrim(coalesce(p_label,''))) not between 3 and 120
 or p_type not in ('monthly','per_visit','interval_days','every_n_visits')
 or coalesce(p_quantity,0) not between 1 and 12 or length(coalesce(p_guidance,''))>500
 or (p_type='interval_days' and (p_min is null or p_max is null or p_min not between 1 and 365 or p_max not between p_min and 365 or p_every is not null))
 or (p_type='every_n_visits' and (p_every is null or p_every not between 1 and 12 or p_min is not null or p_max is not null))
 or (p_type in ('monthly','per_visit') and (p_min is not null or p_max is not null or p_every is not null))
 then raise exception 'Regra, frequência ou intervalo inválido.'; end if;
 insert into public.plan_care_templates(plan_tier,service_label,cadence_type,min_days,max_days,every_n_visits,monthly_quantity,guidance,enabled)
 values(p_tier,btrim(p_label),p_type,p_min,p_max,p_every,p_quantity,coalesce(p_guidance,''),p_enabled)
 on conflict (plan_tier, (lower(service_label))) do update
 set cadence_type=excluded.cadence_type,min_days=excluded.min_days,max_days=excluded.max_days,
 every_n_visits=excluded.every_n_visits,monthly_quantity=excluded.monthly_quantity,guidance=excluded.guidance,
 enabled=excluded.enabled,updated_at=now()
 returning id into result_id;
 return result_id;
end $$;

create function public.save_subscription_care_rule(
 p_subscription_id uuid,p_label text,p_type text,p_min int default null,p_max int default null,
 p_every int default null,p_quantity int default 1,p_month date default null
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare s public.package_subscriptions; b public.package_included_benefits; rule_id uuid;
begin
 if auth.uid() is null or private.current_app_role() not in ('owner','admin') then
  raise exception using errcode='42501',message='Somente ADM pode alterar os benefícios contratados.';
 end if;
 select * into s from public.package_subscriptions where id=p_subscription_id;
 if not found then raise exception 'Plano não encontrado.'; end if;
 if p_month is null or extract(day from p_month)<>1 or p_month<date_trunc('month',s.starts_on)::date
 or p_month<date_trunc('month',(now() at time zone 'America/Sao_Paulo')::date)::date
 or length(btrim(coalesce(p_label,''))) not between 3 and 120
 or p_type not in ('monthly','per_visit','interval_days','every_n_visits')
 or p_quantity not between 1 and 12
 or (p_type='interval_days' and (p_min is null or p_max is null or p_min not between 1 and 365 or p_max not between p_min and 365 or p_every is not null))
 or (p_type='every_n_visits' and (p_every is null or p_every not between 1 and 12 or p_min is not null or p_max is not null))
 or (p_type in ('monthly','per_visit') and (p_min is not null or p_max is not null or p_every is not null))
 then raise exception 'Revise período, contrato e frequência.'; end if;
 select * into b from public.package_included_benefits
 where subscription_id=s.id and lower(service_label)=lower(btrim(p_label))
  and effective_from_month<=p_month and (retired_from_month is null or retired_from_month>p_month)
 order by effective_from_month desc limit 1 for update;
 if found then
  -- A historical contract rule must not be rewritten for previous months.
  if b.effective_from_month < p_month then
   update public.package_included_benefits set retired_from_month=p_month where id=b.id;
   insert into public.package_included_benefits(
    subscription_id,service_label,frequency,monthly_quantity,effective_from_month,
    cadence_min_days,cadence_max_days,every_n_visits,created_by)
   values(s.id,btrim(p_label),p_type,p_quantity,p_month,p_min,p_max,p_every,auth.uid())
   returning id into rule_id;
  else
   update public.package_included_benefits
   set frequency=p_type,monthly_quantity=p_quantity,cadence_min_days=p_min,cadence_max_days=p_max,
    every_n_visits=p_every
   where id=b.id returning id into rule_id;
  end if;
  insert into public.plan_care_rule_audit(benefit_id,subscription_id,previous_rule,new_rule,changed_by)
  values(b.id,s.id,
   jsonb_build_object('frequency',b.frequency,'monthly_quantity',b.monthly_quantity,
     'min_days',b.cadence_min_days,'max_days',b.cadence_max_days,'every_n_visits',b.every_n_visits,
     'effective_month',b.effective_from_month),
   jsonb_build_object('frequency',p_type,'monthly_quantity',p_quantity,
     'min_days',p_min,'max_days',p_max,'every_n_visits',p_every,
     'effective_month',p_month,'version_id',rule_id),auth.uid());
 else
  insert into public.package_included_benefits(subscription_id,service_label,frequency,monthly_quantity,effective_from_month,
   cadence_min_days,cadence_max_days,every_n_visits,created_by)
  values(s.id,btrim(p_label),p_type,p_quantity,p_month,p_min,p_max,p_every,auth.uid())
  returning id into rule_id;
 end if;
 return rule_id;
end $$;
revoke all on function public.save_plan_care_template(text,text,text,int,int,int,int,text,boolean) from public,anon;
revoke all on function public.save_subscription_care_rule(uuid,text,text,int,int,int,int,date) from public,anon;
grant execute on function public.save_plan_care_template(text,text,text,int,int,int,int,text,boolean) to authenticated;
grant execute on function public.save_subscription_care_rule(uuid,text,text,int,int,int,int,date) to authenticated;
