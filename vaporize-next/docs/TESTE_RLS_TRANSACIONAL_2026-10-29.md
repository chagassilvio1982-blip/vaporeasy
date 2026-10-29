# Teste transacional de isolamento RLS — 29/10/2026

## Ambiente
- Supabase exclusivamente isolado Vaporize Next: `cfpvexgkjsqpwhebsoos`.
- Sem alteração na V2 ou produção.
- Consulta executada em transação explícita `BEGIN ... ROLLBACK`.

## Procedimento
1. Inseridas temporariamente organizações sintéticas A e B.
2. Inseridos clientes sintéticos A e B, cada qual na organização correspondente.
3. Criada temporariamente membership `owner` de um usuário já existente em `auth.users` somente na organização A. Não foi alterado o usuário.
4. Identidade configurada com `set_config('request.jwt.claim.sub', ..., true)` **antes** de `SET LOCAL ROLE authenticated`.
5. Consultadas a tabela `vaporize_next.clients`, a tabela `vaporize_next.organizations` e a RPC `public.vaporize_next_my_organizations()`.
6. Executado `ROLLBACK`.

## Resultado observado
```
has_identity = true
visible_clients = 1
visible_orgs = 1
visible_org_table = 1
```

Existiam dois clientes e duas organizações dentro da transação; o papel autenticado viu somente os recursos da empresa A. A primeira tentativa, com identidade definida após trocar de papel, retornou zeros porque a consulta à membership já estava sujeita à RLS; a segunda execução corrigiu a ordem de configuração da identidade.

## Verificação de limpeza após rollback
```
organizations = 0
memberships = 0
clients = 0
vehicles = 0
```

## Limites
Este é um teste real de políticas RLS no banco, mas a identidade foi simulada por `request.jwt.claim.sub` no contexto SQL. Não é um teste end-to-end com dois usuários autenticados e JWTs emitidos pelo Supabase. Recuperação PKCE no navegador permanece pendente.
