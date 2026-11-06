-- Vaporize Next / agenda: auditoria somente leitura
-- Executar exclusivamente no Supabase de homologacao cfpvexgkjsqpwhebsoos.
-- Nao altera dados, permissoes ou esquema.
-- Verificar manualmente os resultados antes de aprovar migracoes.

-- 1. RLS habilitada em todas as tabelas do schema
select c.relname as tabela, c.relrowsecurity as rls_ativa
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'vaporize_next' and c.relkind = 'r'
order by c.relname;

-- 2. Politicas e operacoes autorizadas
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'vaporize_next'
order by tablename, policyname;

-- 3. Restricoes: FK, checks, unicidade e exclusao de sobreposicao
select c.conrelid::regclass as tabela, c.conname as restricao,
       c.contype as tipo, pg_get_constraintdef(c.oid) as definicao
from pg_constraint c
join pg_namespace n on n.oid = c.connamespace
where n.nspname = 'vaporize_next'
order by c.conrelid::regclass::text, c.conname;

-- 4. Agendamentos inconsistentes (resultado esperado: zero)
select id, organization_id, vehicle_id, starts_at, ends_at
from vaporize_next.appointments
where ends_at <= starts_at;

-- 5. Sobreposicoes de agendamento do mesmo veiculo
-- Resultado esperado: zero, exceto se estados cancelados forem intencionalmente incluidos.
select a.id as agendamento_a, b.id as agendamento_b
from vaporize_next.appointments a
join vaporize_next.appointments b
  on a.organization_id = b.organization_id
 and a.vehicle_id = b.vehicle_id
 and a.id < b.id
 and a.starts_at < b.ends_at
 and b.starts_at < a.ends_at
where a.status <> 'cancelled' and b.status <> 'cancelled';

-- 6. Integridade de organizacao do veiculo
select a.id as agendamento, a.organization_id, v.organization_id as org_veiculo
from vaporize_next.appointments a
join vaporize_next.vehicles v on v.id = a.vehicle_id
where a.organization_id <> v.organization_id;
