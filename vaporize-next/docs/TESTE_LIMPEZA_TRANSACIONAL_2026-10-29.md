# Validação transacional da limpeza administrativa — 2026-10-29

Ambiente: somente Supabase homologação `cfpvexgkjsqpwhebsoos`.

## Evidência observada

Executada uma transação SQL com uma organização sintética e um cliente sintético. O cliente foi identificado simultaneamente por `id`, `organization_id` e `name`. A rotina verificou correspondência exata (1), executou DELETE, verificou 1 linha afetada e confirmou ausência do registro. Após `ROLLBACK`, consulta confirmou `residual_client=0` e `residual_org=0`.

Resposta do banco: `scoped cleanup SQL assertion passed and rolled back`.

## Limites

Este teste não executou POST HTTP, não verificou limpeza após commit e não criou contas Auth sintéticas. A rotina não deve ser liberada para dados reais nem habilitar o script HTTP existente automaticamente. É necessário integrar a execução administrativa por IDs retornados pela API, verificar as identidades sintéticas e confirmar a remoção após commit.

Nenhuma alteração de política RLS ou privilégio foi feita.
