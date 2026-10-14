-- Homologation seed correction: graphene treatment is once per calendar month.
-- No subscribed-vehicle rules or historical service events changed.
update public.plan_care_templates
set cadence_type='monthly',min_days=null,max_days=null,every_n_visits=null,
 monthly_quantity=1,guidance='Uma aplicação por mês, quando este tratamento estiver contratado.',
 updated_at=now()
where plan_tier='premium' and lower(service_label)=lower('Selante com grafeno da pintura')
 and cadence_type='interval_days';
