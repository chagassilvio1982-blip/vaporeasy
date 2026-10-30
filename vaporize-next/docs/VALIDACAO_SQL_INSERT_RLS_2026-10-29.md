# Validação SQL de INSERT/RLS — Vaporize Next

Data: 2026-10-29. Ambiente exclusivo: Supabase `cfpvexgkjsqpwhebsoos` (Vaporize Next - Homologação).

## Procedimento executado

Transação PostgreSQL `BEGIN`/`ROLLBACK`, com duas organizações temporárias, dois usuários já existentes em `auth.users` (sem alterar essas contas), vínculos temporários e `SET LOCAL ROLE authenticated` com `request.jwt.claim.sub` de teste. Operações reais de `INSERT INTO vaporize_next.clients (organization_id,name,phone)`; exceções esperadas capturadas para negativas.

## Resultado observado

- Owner da empresa A: INSERT autorizado.
- Manager da empresa A: INSERT autorizado.
- Collaborator da empresa A: INSERT recusado por RLS.
- Owner da empresa A tentando inserir na empresa B: INSERT recusado por RLS.
- Resultado SQL final: `insert checks passed; rolled back`, `remaining_orgs=0`, `remaining_test_clients=0`.

## Limitações

A sessão foi simulada dentro do PostgreSQL; estes testes **não** são validação de JWT criptográfico nem POST HTTP pela Data API. A evidência anterior enviada pelo usuário demonstra Auth HTTP 200 e GET de `clients` com JWT HTTP 200, mas não POST.

## Próximo passo

Testar POST real autenticado (owner/manager) e POST negado (collaborator/outra organização) com contas sintéticas em homologação; evitar exibir tokens ou credenciais em logs. Não tocar na V2, produção ou domínios oficiais.
