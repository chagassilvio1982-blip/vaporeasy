# Testes locais de autenticação — 2026-10-29

- Ambiente: Node.js v22.16.0.
- Método: cópia local reconstruída manualmente a partir do controlador e testes consultados no GitHub; não foi um checkout autenticado do repositório.
- Execução: `node --test tests/auth.test.mjs`.
- Resultado local: 8 testes aprovados, 0 falhas, duração aproximada 110 ms.
- Cenários: bloqueio sem sessão de recuperação; recuperação por token_hash; troca de código PKCE; rejeição de tipo inválido; senha curta; rejeição de PKCE sem intenção explícita; mudança de identidade; bloqueio de usuário autenticado sem autorização de empresa.
- Foi adicionado teste de regressão de bloqueio multiempresa ao repositório no commit `22ef7eb0`.

## Limitações
- Supabase simulado, sem requisições reais.
- Não demonstra execução do GitHub Actions, navegador, recuperação por e-mail ou isolamento A/B entre organizações.
- Nenhum dado ou conta da V2 foi usado.
