# Validação RPC de autorização — 2026-10-29

## Ambiente
Supabase isolado `cfpvexgkjsqpwhebsoos`.

## Evidências
- Função `public.vaporize_next_my_organizations()` implantada via migração 0002.
- Catálogo PostgreSQL: `SECURITY DEFINER`, `search_path` vazio, execução negada a `anon` e concedida a `authenticated`.
- Teste transacional de leitura: `BEGIN; SET LOCAL ROLE authenticated; SELECT count(*) FROM public.vaporize_next_my_organizations(); ROLLBACK;` retornou **0** sem identidade JWT.
- Contagem administrativa: `organizations=0`, `memberships=0`, `clients=0`, `vehicles=0`.
- Teste de regressão antigo atualizado no commit `82414e4` para exigir consulta RPC.

## Não concluído
- Teste com usuários reais sintéticos de homologação e JWTs distintos.
- Teste A/B de isolamento entre empresas.
- Execução comprovada de toda a suíte Node no GitHub Actions.
- Homologação de login e recuperação no navegador.
- Hospedagem Vercel independente (criação bloqueada por 403).

Não foram feitas alterações na V2 ou no Supabase de produção.
