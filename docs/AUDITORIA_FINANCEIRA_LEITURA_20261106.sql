-- AUDITORIA SOMENTE LEITURA — não altera produção
-- Executar no projeto Supabase correto com acesso autorizado.
-- Resultados devem ser conferidos antes de qualquer alteração.
-- 1. Mensalidades com múltiplos contratos por cliente/competência:
select pc.client_id,pc.competence_month,count(distinct pc.subscription_id) as contratos,
       count(*) as lancamentos,sum(pc.amount) as valor_total
from public.package_charges pc
where pc.competence_month >= date '2026-10-01'
  and pc.status <> 'cancelled'
group by pc.client_id,pc.competence_month
having count(distinct pc.subscription_id)>1
order by pc.competence_month desc;
-- 2. Pagamentos avulsos vinculados a visitas que pertencem a planos:
select a.id as appointment_id,a.client_id,a.vehicle_id,a.recurring_plan_id,
       ap.status,ap.amount,a.starts_at
from public.appointments a
join public.package_subscriptions ps on ps.recurring_plan_id=a.recurring_plan_id
join public.appointment_payments ap on ap.appointment_id=a.id
where a.starts_at >= timestamptz '2026-10-01 00:00:00-03'
  and a.deleted_at is null
order by a.starts_at desc;
-- 3. Cobranças com divergência de cliente/veículo/serviço em relação ao contrato:
select pc.id as charge_id,pc.subscription_id,pc.competence_month,
       pc.client_id as charge_client_id,ps.client_id as subscription_client_id,
       pc.vehicle_id as charge_vehicle_id,ps.vehicle_id as subscription_vehicle_id,
       pc.service_id as charge_service_id,ps.service_id as subscription_service_id
from public.package_charges pc
join public.package_subscriptions ps on ps.id=pc.subscription_id
where pc.client_id is distinct from ps.client_id
   or pc.vehicle_id is distinct from ps.vehicle_id
   or pc.service_id is distinct from ps.service_id;
-- 4. Mensalidades pagas e pendentes no mesmo cliente e competência:
select client_id,competence_month,
       count(*) filter(where status='paid') as pagas,
       count(*) filter(where status='pending') as pendentes
from public.package_charges
where competence_month >= date '2026-10-01'
group by client_id,competence_month
having count(*) filter(where status='paid')>0
   and count(*) filter(where status='pending')>0;
