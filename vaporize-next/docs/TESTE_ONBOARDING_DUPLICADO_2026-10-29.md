# Validação do onboarding multiempresa — 29/10/2026

Projeto Supabase isolado: `cfpvexgkjsqpwhebsoos`. Branch: `vaporize-next/isolado-20261029`.

## Teste transacional executado

1. `BEGIN`, identidade simulada via `request.jwt.claim.sub` de um usuário existente, `SET LOCAL ROLE authenticated`.
2. Chamada de `public.vaporize_next_create_organization` criou empresa temporária.
3. Segunda chamada com outro slug para a mesma identidade foi rejeitada com `unique_violation`, conforme verificação no bloco PL/pgSQL.
4. Consulta `public.vaporize_next_my_organizations()` retornou `organization_count = 1`.
5. `ROLLBACK`. Consulta independente confirmou `organizations = 0`, `memberships = 0`.

## Preview

A URL `https://vaporeasy-gc5tomqhf-vaporeasy.vercel.app/vaporize-next/` foi carregada via leitura remota e retornou título `Vaporize Next — Acesso`. Isso comprova carregamento do documento, não a execução interativa do formulário.

## Limites

A identidade JWT foi simulada no PostgreSQL; não é teste de navegador autenticado nem de dois usuários reais. Nenhuma empresa persistente foi criada, e não houve modificação da V2 ou produção.
