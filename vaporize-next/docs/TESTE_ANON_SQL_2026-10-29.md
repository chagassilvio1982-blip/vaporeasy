# Verificação de acesso anônimo — 29/10/2026

Ambiente: Supabase isolado `cfpvexgkjsqpwhebsoos`.

## Consulta executada
```sql
BEGIN;
SET LOCAL ROLE anon;
SELECT (SELECT count(*) FROM vaporize_next.organizations) AS orgs,
       (SELECT count(*) FROM vaporize_next.clients) AS clients,
       (SELECT count(*) FROM vaporize_next.vehicles) AS vehicles;
ROLLBACK;
```

## Resultado
O PostgreSQL retornou **SQLSTATE 42501**, `permission denied for schema vaporize_next`, na primeira referência à tabela. Isso é uma recusa de acesso, não uma consulta que retornou zero linhas.

Como a transação gerou erro, não houve persistência de mudanças; o procedimento não fez inserções.

## Limites
Este teste verifica permissões SQL do papel `anon`. Não comprova comportamento HTTP da Data API nem substitui testes com JWTs de dois usuários.
