# Encaixe autorizado pelo ADM — 08/10/2026

Base: homologacao-isolada-20261005, 9e02a95c7bdd574e71d052fc783cec52ffa3ec8f.
Banco alterado e testado: wwivmyhlwqyzmaexkmnk (Homologação Isolada).
Produção não alterada nesta execução.

## Comportamento

Proprietário/ADM pode criar atendimento pontual com horário manual, justificativa de pelo menos 10 caracteres e confirmação explícita. Ignora capacidade e sobreposição da equipe, mantendo validação do veículo, cliente, serviço e equipe ativa. A autorização fica registrada no atendimento. Não cria recorrências nem contrata planos. Para remanejar um encaixe, cancelar e criar outro.

## Testes executados

- `tests/r0/admin-schedule-override.sql`: 11 cenários aprovados no banco isolado, em transação encerrada com ROLLBACK. Inclui capacidade/conflito normal, autorização owner/admin, idempotência, duplicidade do veículo, falsificação da autorização, operator, auth nulo, EXECUTE de anon revogado, admin inativo e cancelamento.
- `tests/admin-schedule-override/dom.cjs`: aprovado com jsdom 26.1.0. Exercita as funções reais da página sobre seu HTML, com RPC simulado: desbloqueio do dia lotado, horário manual, payload, desistência da confirmação, bloqueio de recorrência e ocultação para operador, plano e edição.
- Scripts inline: análise sintática aprovada via Node vm.Script. `git diff --check` aprovado.
- Advisors de segurança: aviso esperado de função SECURITY DEFINER executável por authenticated; a função verifica auth.uid e perfil ativo owner/admin. EXECUTE não é concedido a PUBLIC/anon.

## Limite da validação

O teste em navegador real não foi executado: Chromium indisponível e download retornou arquivo inválido. O arquivo run.cjs é o teste de navegador preparado, sem aprovação atribuída. Login real e fluxo integrado browser → API → banco ainda precisam ser validados antes de promover produção.

## Rollback

Checkpoint do frontend: 9e02a95c7bdd574e71d052fc783cec52ffa3ec8f. Reverter somente as mudanças desta correção no frontend, preservando mudanças posteriores de outras tarefas. Para interromper novos encaixes, revogar EXECUTE de authenticated em public.create_admin_schedule_override(uuid,uuid[],uuid,date,time,uuid,uuid,text,text,text). Manter colunas, auditoria e validação dos encaixes existentes; não apagar atendimentos autorizados nem tentar restabelecer exclusões incompatíveis com sobreposições já autorizadas. Uma reversão completa do schema exige antes avaliar os encaixes existentes e suas sobreposições.
