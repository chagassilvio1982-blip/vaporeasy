-- SOMENTE homologacao wwivmyhlwqyzmaexkmnk. Checkpoint anterior ao ajuste autorizado de 45 dias.
begin;
update public.package_included_benefits set frequency='monthly',cadence_min_days=null,cadence_max_days=null,every_n_visits=null where id in ('d7bcddd8-1f94-4fd3-ad47-4a8567298400','ef6da10a-f43e-464e-afbc-784dab95b959') and frequency='interval_days' and cadence_min_days=45 and cadence_max_days=45;
update public.plan_care_templates set cadence_type='interval_days',min_days=60,max_days=90,guidance='Inspecionar uso e comportamento da água; antecipar ou adiar dentro da janela após avaliação.',updated_at='2026-10-14T20:06:05.137898+00:00' where id='c5f1a62a-91bf-44ce-804a-9ebd0b7b3fc1';
update public.plan_care_templates set cadence_type='interval_days',min_days=60,max_days=60,guidance='Aplicar apenas quando o veículo tiver couro e o serviço estiver contratado.',updated_at='2026-10-14T20:06:05.137898+00:00' where id='098a960d-dceb-402a-8ccc-15100c125880';
update public.plan_care_templates set cadence_type='monthly',min_days=null,max_days=null,guidance='Uma aplicação por mês, quando este tratamento estiver contratado.',updated_at='2026-10-14T20:11:53.800745+00:00' where id='f8a1c999-a17d-4bc5-b2f0-40f18440d0a7';
commit;
