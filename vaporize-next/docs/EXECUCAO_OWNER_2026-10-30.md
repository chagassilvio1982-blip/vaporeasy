# Execução confirmada — proprietário da homologação (2026-10-30)

Projeto Supabase isolado: `cfpvexgkjsqpwhebsoos`.

Autorização explícita do usuário nesta conversa: vincular `chagassilvio1982@gmail.com` como owner de uma organização de homologação.

## Executado
- Criada organização `Vaporize Next Homologação`, slug `vaporize-next-homologacao`.
- UUID organização: `4eed149d-2907-4604-8d92-ecf212762664`.
- Vinculada conta Auth existente `chagassilvio1982@gmail.com` com `role=owner`, `status=active`.
- Confirmação independente via SELECT com JOIN de organizations, memberships e auth.users: organização ativa, vínculo ativo e role owner.
- Nenhuma nova conta Auth criada. Nenhuma senha ou token acessado ou registrado.

## Pendente
- Criar identidades de teste separadas para manager/collaborator e outro tenant, sem usar contas pessoais automaticamente.
- Executar HTTP/JWT POST por papel, com limpeza administrativa segura após COMMIT.
- Não declarar o Bloco 2 concluído até validação HTTP.

## Isolamento
Não alterar Vaporeasy V2/V3, BarberGestão, produção ou domínios.

## Atualização — perfis de homologação (30/10/2026)
- Consulta autenticada no projeto `cfpvexgkjsqpwhebsoos` confirmou três usuários Auth com `email_confirmed_at` preenchido.
- `chagassilvio1982@gmail.com`: `owner`, `active`, preservado.
- `vaporeasy@outlook.com`: usuário Auth existente, confirmado em 30/10/2026; novo vínculo `manager`, `active` na organização `vaporize-next-homologacao`.
- `daysupabase@gmail.com`: usuário Auth existente, confirmado em 29/10/2026; novo vínculo `collaborator`, `active` na mesma organização.
- SQL INSERT retornou ambos os vínculos novos. Nenhum usuário Auth foi criado via SQL. Nenhuma credencial foi acessada.
- Leitura de `pg_policies` confirmou SELECT de clients por membro, INSERT de clients por owner/manager, SELECT de memberships por membro. Não há DELETE de clients; limpeza de fixtures após POST real segue bloqueada.
- **PENDENTE:** teste HTTP POST/JWT com sessão real de cada papel, teste cross-tenant com conta independente, limpeza segura pós-COMMIT. Não declarar Bloco 2 concluído.
- Preservados produção, V2, V3, BarberGestão e domínios.

## Verificador de leitura e CI — atualização de 30/10/2026
- Criado `vaporize-next/scripts/check-rest-roles-readonly.mjs`, commit `94f51bae618ec2ba6d33c701ae73be755c2797a1`. O script faz GET de Auth, memberships e clients para owner/manager/collaborator; não realiza gravações e não imprime credenciais.
- Workflow `.github/workflows/vaporize-next-unit-tests.yml` atualizado no commit `1f4014014ed67355034e73814191c0e77480e453` para validar sintaxe do verificador e executar `npm test` quando acionado.
- Consulta de workflow runs associados ao commit `1f4014014ed67355034e73814191c0e77480e453` retornou lista vazia. A consulta disponível filtra execuções associadas a pull requests; **não comprova ausência de execuções push**. CI permanece não comprovado.
- Não há acesso a JWTs independentes seguros para executar o script nesta sessão. Nenhuma requisição autenticada de teste foi executada, e nenhuma escrita em clients foi feita.
- Próximas condições: execução de leitura com três sessões Auth independentes; evidência de CI; fixture de segundo tenant e estratégia administrativa de limpeza antes de POST.

## Auditoria Supabase Advisors — 30/10/2026
- Consulta somente leitura `get_advisors(type=security|performance)` no projeto de homologação `cfpvexgkjsqpwhebsoos`.
- Segurança: alerta `authenticated_security_definer_function_executable` inclui `vaporize_next.is_member` e `vaporize_next.can_manage_clients`. A exposição de execução é sinalizada pelo linter; verificar se o EXECUTE é necessário para RLS antes de qualquer REVOKE. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Segurança: `auth_leaked_password_protection` desativado. Referência: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Performance: índices ausentes em FKs `next_appointment_vehicle_same_org` e `next_vehicle_client_same_org`. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- Outros alertas de funções `public.*` e índices do schema `public` também existem, mas são externos ao escopo de alteração do Bloco 2; não modificar.
- Nenhum privilégio, RLS, Auth, tabela ou índice alterado nesta auditoria. A execução HTTP/JWT real segue pendente.

## Fixtures de isolamento HTTP/JWT — 30/10/2026
- Criados e confirmados exclusivamente no Supabase de homologação: organização A `4eed149d-2907-4604-8d92-ecf212762664`, organização B `c49f62ac-94b5-47bc-a292-3b53c563ae04` (`vaporeasy-rls-fixture-b`).
- Cliente fictício A `ca21e0de-05e3-49f0-b0d5-8f3cb0010101` e cliente fictício B `cb21e0de-05e3-49f0-b0d5-8f3cb0010102`; verificados por SQL, um cliente por organização.
- O script `scripts/check-rest-roles-readonly.mjs` agora exige `TEST_ORG_B_ID` e presença de um cliente visível na organização A. Deve receber `TEST_ORG_B_ID=c49f62ac-94b5-47bc-a292-3b53c563ae04` por variável de ambiente.
- Organização B não possui membro autenticado próprio; a consulta de memberships B vazia não comprova isolamento de memberships (resultado explicitamente `no-visible-rows-unverified-fixture`).
- Pendente: três sessões JWT reais, execução e evidências HTTP. Não armazenar JWT no GitHub nem nos logs. Fixtures são artificiais e precisam ser excluídas após os testes com rotina de limpeza validada.

## Encerramento da etapa de preparação de permissões — 30/10/2026
- Consultadas políticas `pg_policies` diretamente em homologação: `clients` SELECT `is_member`, INSERT `can_manage_clients`; `memberships` SELECT `is_member`. Não há política de INSERT para `collaborator`.
- Consultadas definições SQL das funções: ambas usam `auth.uid()`, membership `active` e organização `active`; `can_manage_clients` restringe a `owner`/`manager`.
- Consulta administrativa sem contexto JWT retornou `false` para `is_member`; isso é esperado e NÃO comprova acesso de qualquer perfil.
- Tentativa de simular contexto `authenticated` com `set local role` foi bloqueada pela ferramenta. Não contornar o bloqueio.
- **Não declarar Bloco 2 concluído**: faltam sessões JWT reais de três usuários, execução HTTP read-only, prova de acesso/negação e teste controlado de escrita. O conector SQL administrativo não substitui uma sessão HTTP autenticada.
