# Validação REST/JWT — 2026-10-29

Ambiente exclusivo: `cfpvexgkjsqpwhebsoos`.

## Evidências obtidas
- `authenticated` tem USAGE no schema `vaporize_next`: **sim**.
- `anon` tem USAGE no schema `vaporize_next`: **não**.
- `current_setting('pgrst.db_schemas', true)` retornou **NULL** no contexto SQL. Isso **não prova** exposição ou ausência de exposição do schema na API.
- O conector Supabase confirmou existência de chave pública moderna e legacy anon. **Nenhum valor de chave foi copiado neste relatório**.
- Script de leitura `scripts/check-rest-schema.mjs` existe e valida estritamente o hostname da homologação.

## Pendente
1. Executar GET `/rest/v1/clients?select=id&limit=0` com `apikey` publishable e `Accept-Profile: vaporize_next` em executor com rede e variáveis de ambiente seguras; registrar apenas HTTP status e código de erro, sem revelar a chave.
2. Obter JWT de conta **sintética de homologação** e repetir consulta com `Authorization: Bearer <JWT>`; testar isolamento A/B via API real. Não reutilizar senha, token ou conta pessoal.
3. Se API retornar `PGRST106`, configurar exposição do schema **somente** no projeto isolado e repetir GET.

## Regra de liberação
Não habilitar cadastro em UI até testes HTTP/JWT reais concluídos. SQL com `request.jwt.claim.sub` simulado **não** equivale a JWT validado pelo gateway.
