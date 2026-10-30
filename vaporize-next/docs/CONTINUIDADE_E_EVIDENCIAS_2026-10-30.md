# Vaporize Next — continuidade e evidências (2026-10-30)

Este documento é o ponto de retomada. Consultar antes de solicitar ações ao usuário. Separar CONCLUÍDO, CONFIRMADO, PENDENTE e NÃO TESTADO. Não repetir testes concluídos sem nova evidência de regressão.

## Ambiente único autorizado
- Supabase homologação: `cfpvexgkjsqpwhebsoos` (projeto Vaporize Next - Homologação).
- Conexão técnica funcional: `link_6ada8db073e081919421cf5907e1abb9`.
- GitHub: `chagassilvio1982-blip/vaporeasy`, branch `vaporize-next/isolado-20261029`.
- Organização proprietária do projeto Supabase: `barbergestao-teste`. Nome semelhante não torna este projeto o BarberGestão.
- Preservar V2, V3, BarberGestão, produção e domínios oficiais.

## CONCLUÍDO / CONFIRMADO
1. Supabase Auth: usuário de teste criado e confirmado em 2026-10-29, conforme registro operacional anterior. **Não recriar por esquecimento.** A identificação exata de qual conta foi usada nesse teste ainda precisa ser conciliada com evidência; não assumir.
2. Tela Authentication > Users acessada no navegador normal em 2026-10-30. Duas contas exibidas, ambas já existentes: `chagassilvio1982@gmail.com` e `daysupabase@gmail.com`. Não usar como contas sintéticas nem alterar papéis sem verificar finalidade e consentimento.
3. Data API: schema `vaporize_next` habilitado; tabela `clients` exposta.
4. RLS: SELECT de membros e INSERT de owner/manager testados em SQL; collaborator e cross-tenant negados; testes transacionais revertidos.
5. GET autenticado HTTP/JWT da tabela clients já validado com HTTP 200 em execução anterior. Não repetir sem motivo.
6. Código de `listClients` e `createClient` presente na branch isolada; testes unitários adicionados. Relato anterior: 12 testes locais aprovados, mas não confundir com HTTP POST real.
7. Workflow sem segredos `.github/workflows/vaporize-next-unit-tests.yml` criado no commit `000bbd58643d7913ff47b52c10d2286a81a8a237`. Execução no GitHub Actions ainda não comprovada.
8. Consulta SQL de 2026-10-30: 2 registros em `auth.users`; zero em `vaporize_next.organizations`, `memberships` e `clients`. Isso **não** invalida a criação de usuários no Auth.

## PENDENTE / BLOQUEIOS
1. Identificar, sem divulgar credenciais, a finalidade da conta de teste Auth criada em 2026-10-29 e estabelecer fixtures de organizações e memberships com isolamento. Não atribuir papel a contas pessoais automaticamente.
2. HTTP POST/JWT real: owner e manager permitidos; collaborator e outra organização negados. Ainda **não testado**.
3. Limpeza pós-COMMIT verificável: não existe política DELETE em clients. O script `check-rest-insert-rls.mjs` tem bloqueio deliberado; não removê-lo sem limpeza administrativa segura e aprovada.
4. GitHub Actions: workflow salvo, mas não há execução comprovada. Não declarar CI aprovado.
5. TinyFish: navegador remoto sem sessão Supabase e login bloqueado por desafio de segurança. Navegador normal do usuário **já acessa** o projeto; não insistir em TinyFish.

## Regra de execução
Antes de qualquer passo: (a) consultar este registro e `AMBIENTES_CONFIRMADOS.md`; (b) conferir ID do projeto; (c) distinguir ação nova de repetição; (d) executar o que for seguro com conectores; (e) registrar evidência e bloqueio; (f) pedir no máximo 1–2 ações ao usuário somente quando necessárias.

Nenhuma senha, token JWT, chave, cookie ou dado pessoal de autenticação deve ser incluído neste registro.

## Verificação complementar de Auth — 2026-10-30
Consulta somente leitura em `auth.users` no projeto isolado:
- `chagassilvio1982@gmail.com`: criado em 2026-10-29 22:43:22 UTC (19:43 Brasília), e-mail confirmado, login registrado, sem marcador `synthetic_test`.
- `daysupabase@gmail.com`: criado em 2026-10-29 11:12:56 UTC (08:12 Brasília), e-mail confirmado, login registrado, sem marcador `synthetic_test`.
- Ambos são contas existentes; a criação mais recente foi à noite. **Não presumir que sejam contas sintéticas ou reutilizá-las em testes destrutivos.**
- Vínculos de `vaporize_next.memberships`: zero na última consulta. Falta uma fixture de autenticação com finalidade comprovada, organização e papéis adequados. Nenhum usuário foi criado ou modificado nesta verificação.
