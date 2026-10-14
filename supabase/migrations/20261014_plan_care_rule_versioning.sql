create or replace function public.save_subscription_care_rule(
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