# Bloco 4 — estado verificado em 2026-10-30

Ambiente: Supabase isolado `cfpvexgkjsqpwhebsoos`; branch `vaporize-next/isolado-20261029`. Não alterar V2, V3, produção ou domínios oficiais.

## Confirmado no banco
- Políticas RLS de leitura por membro e escrita de agendamentos por owner/manager; collaborator não pode inserir (erro 42501 em teste de role authenticated).
- Corrigida ausência de GRANT SELECT/INSERT/UPDATE à role authenticated em appointments. Migração aplicada `vaporize_next_appointments_authenticated_grants_20261030`; código em `migrations/20261030_appointments_authenticated_grants.sql`.
- INSERT como manager authenticated funcionou em transação revertida; contagem de agendamentos de teste permanece zero.
- Constraint de horários a partir das 07h30, grade de 20 minutos em America/Sao_Paulo, aplicada e testada com horário inválido.
- Exclusion constraint de conflito por organização+veículo, integridade de vínculo entre organização e veículo e intervalo válido aplicadas. Testes SQL transacionais anteriores confirmaram conflito e isolamento.
- Três perfis (owner, manager, collaborator) cadastrados e com memberships ativos.

## Código
- Formulário da agenda integrado a create/update/cancel e recorrência com inserção única atômica, na branch isolada.
- Regras: 07h30, 20 minutos, duração padrão 90 minutos, recorrência semanal/quinzenal, fuso São Paulo.
- Teste de recorrência corrigido para UUID real do veículo em commit `a4c1ed1`.

## Pendências de liberação — não declarar conclusão antes da evidência
1. Suíte completa `npm test` em Node 22 **aprovada** em GitHub Actions run #247 (147/147); evidência abaixo.
2. Preview READY no commit `a8d1d73`, com código runtime idêntico ao commit `a75eec6` aprovado no CI. Último SHA ainda não publicado por limite diário Vercel.
3. Testar fluxos HTTP/PostgREST com JWT de sessões reais owner/manager/collaborator e navegação E2E da Preview atualizada; não coletar senhas/tokens no chat.
4. Verificar funcionalidade no dispositivo e estados de erro, incluindo conflito, edição, cancelamento e recorrência.

## Regra de continuidade
Continuar automaticamente; só solicitar intervenção do usuário para autenticação estritamente necessária. Nunca publicar produção nem declarar homologação concluída sem os testes finais.

## Verificação executada em 2026-10-30 — CI, SQL e Preview
- GitHub Actions `Vaporize Next unit tests`: run #246 (`41123549927`) executou 147 testes: 145 passaram, 2 falharam, ambos em `tests/panels-runtime.test.mjs` porque o mock de DOM não incluía `appointment-plan-form` e outros elementos adicionados ao formulário. Não era falha demonstrada da interface real.
- Fixture de DOM atualizada no commit `a75eec617564fae6114d23a3ef782b46f59960dd` sem alterar código de produção. Run #247 (`41123902801`) comprovado via logs do job `auth-tests`: **147 testes, 147 aprovados, zero falhas, zero ignorados**, Node 22. Evidência: https://github.com/chagassilvio1982-blip/vaporeasy/actions/runs/41123902801.
- SQL de homologação com contexto `authenticated` e identidade do manager: inserção de dois agendamentos recorrentes, edição do primeiro e cancelamento do segundo, todos em transação revertida. SELECT na transação retornou `total=2, edited=1, cancelled=1`. SELECT administrativo posterior confirmou **zero agendamentos persistidos**.

- Teste SQL adicional com manager em transação: cancelar atendimento e reservar novamente o mesmo horário para o mesmo veículo foi permitido pela constraint parcial (1 cancelado, 1 agendado). ROLLBACK aplicado; consulta administrativa posterior retornou zero agendamentos. Não é validação HTTP/JWT.
- Tentativa de manager gravar na organização B com veículo B recebeu `42501 new row violates row-level security policy`, confirmando negação cross-tenant na camada SQL. Esse teste **não substitui** requisição HTTP com JWT real.
- Vercel Preview READY `dpl_4GLLvtQF2Vp7ksEcHZRXx9abkHeG`, commit `a8d1d73df8bdcacce1922a5b262fc080c5ed3562`, URL: https://vaporeasy-ho9zb9si4-vaporeasy.vercel.app/vaporize-next/. A página de acesso e os painéis foram carregados em smoke test público anterior.
- Comparação GitHub entre commit publicado `a8d1d73` e commit aprovado em CI `a75eec6` mostrou **somente dois arquivos de teste alterados**, nenhum arquivo de runtime. Portanto a Preview READY contém o mesmo código executável que passou no CI, embora não o último SHA.
- Tentativa de publicar o SHA `a75eec6` foi recusada pela Vercel com HTTP 402, código `api-deployments-free-per-day`, limite diário gratuito e `retryAfter=86400`. **Não contratar plano nem alterar cobrança.** Reavaliar quando liberar.

### Bloqueios ainda reais
1. Não há sessões JWT reais independentes e acessíveis com segurança para owner, manager e collaborator. O teste HTTP/PostgREST por papel, com leitura e escrita controlada, continua **não executado**. O teste SQL com `SET LOCAL ROLE authenticated` não é equivalente a autenticação de rede.
2. Não houve E2E autenticado na Preview, incluindo criação, edição, cancelamento e recorrência por interface. Exige sessão de homologação válida; não pedir credenciais nem tokens em chat.
3. Publicação com o último SHA bloqueada temporariamente pelo limite gratuito, mas **nenhuma diferença de runtime** em relação à Preview READY. Aguardar liberação sem gastar recursos.

### Próxima execução
Verificar disponibilidade de Preview sem criar builds repetidos; tentar autenticação E2E somente quando houver sessão autorizada e segura. Preservar V2, V3, produção e domínios. Não declarar homologação final até HTTP/JWT e E2E.

## Execução de continuidade — 2026-10-30, 17h40–17h50 (São Paulo)
- Verificado o commit HEAD `f1804ea0ee2296756d62339dca9d2f9d1123476b` da branch isolada. Comparação GitHub `a75eec6..f1804ea`: apenas este documento alterado; **nenhuma mudança de runtime** após a suíte aprovada de 147/147 testes (Actions `41123902801`). Não repetir suíte sem regressão.
- **Limite Vercel liberado.** Preview do HEAD publicado com sucesso, sem target de produção e sem alterar domínios: deployment `dpl_9g7eRanPzLwsnZ3pyQYd6t3oidzf`, estado **READY**, commit `f1804ea0ee2296756d62339dca9d2f9d1123476b`, URL https://vaporeasy-67mn2pv1n-vaporeasy.vercel.app/vaporize-next/ .
- Smoke test público do novo endereço por navegador TinyFish, execução `606dbd20-82fe-4121-87b2-83eee6b4d199`: tela `Vaporize Next — Acesso`, indicação `AMBIENTE DE HOMOLOGAÇÃO`, formulário de login e recuperação de senha visíveis, sem erros HTTP ou de interface observados. Evidência: https://agent.tinyfish.ai/runs/606dbd20-82fe-4121-87b2-83eee6b4d199 . Teste **não autenticado**; não confundir com E2E.
- Leitura de integridade no Supabase homologação: `auth.users=3`, `organizations=2`, `memberships=3`, `appointments=0`. Sem gravações nesta execução. Documento `CONTINUIDADE_E_EVIDENCIAS_2026-10-30.md` contém contagens antigas de 2 usuários e 0 memberships; usar estas contagens mais recentes, sem alterar contas pessoais.
- TinyFish `list_profiles`: perfis `Vaporize Next — Homologação`, `Vaporize Next — Gerente` e `Vaporize Next — Colaborador` existem, mas **nenhum possui site autenticado registrado**. Não há sessão segura utilizável para HTTP/JWT por papel ou E2E autenticado. Não pedir senhas ou tokens na conversa; aguardar autenticação de perfil pelo titular.
- **Pendências únicas para fechar o Bloco 4:** HTTP/PostgREST com JWT real de owner, manager e collaborator (incluindo cross-tenant) e E2E autenticado na Preview acima (criar/editar/cancelar/recorrência/conflitos). A publicação e os testes unitários já estão aprovados; não repetir.
