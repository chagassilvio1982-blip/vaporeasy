# Auditoria de autorização — Vaporize Next
Data: 2026-10-29
Ambiente único: Supabase homologação `cfpvexgkjsqpwhebsoos`
Escopo: `vaporize_next`; não modificar V2, produção ou domínios.

## Confirmado por consultas de leitura no banco
- Migração aplicada: `20261029215717 vaporize_next_0005_clients_insert_owner_manager`.
- Tabela `vaporize_next.clients`: políticas `next_clients_read` (SELECT) e `next_clients_insert_owner_manager` (INSERT).
- Política INSERT usa `vaporize_next.can_manage_clients(organization_id)`.
- Definição efetiva da função: `SECURITY DEFINER`, `search_path=''`, compara `auth.uid()` ao `memberships.user_id`, exige `membership.status='active'`, `organization.status='active'`, `role IN ('owner','manager')`.
- `authenticated` tem INSERT apenas nas colunas `organization_id`, `name`, `phone`; `notes` não.
- `anon` não possui USAGE no schema, INSERT na tabela nem EXECUTE na função.
- Contagem observada: zero organizações, vínculos e clientes.
- Teste sem identidade vinculada retornou `false` para `can_manage_clients`.
- Função `public.vaporize_next_create_organization` usa `auth.uid()`, trava por usuário e recusa usuário já vinculado.
- Auditor de segurança Supabase: alertas de `SECURITY DEFINER` autenticado em duas RPCs públicas do Next; são acessos intencionais, mas requerem avaliação continuada.
- A configuração de schemas expostos no PostgREST **não foi confirmada**.

## Não testado
- JWT real de proprietário A, gerente A e colaborador A.
- Bloqueio de INSERT cruzado A→B e B→A.
- Revogação de vínculo, organização suspensa e resposta HTTP real.
- Acessibilidade do schema customizado pela API REST.

## Portão de liberação
Não habilitar interface de cadastro nem afirmar isolamento A/B aprovado antes de validar os casos com identidades sintéticas reais e confirmar a exposição controlada do schema.
