# Limpeza administrativa controlada — execução pendente

Ambiente exclusivo: Supabase homologação `cfpvexgkjsqpwhebsoos`.

## Teste pós-COMMIT

O teste transacional com ROLLBACK foi aprovado. A tentativa de testar a exclusão com COMMIT via ferramenta administrativa foi bloqueada por controles de segurança; **não há evidência de execução ou persistência de dados nessa tentativa**. Não contornar o bloqueio.

## Procedimento para operador autorizado

1. Confirmar que os registros são sintéticos e que o projeto ID corresponde exatamente a `cfpvexgkjsqpwhebsoos`.
2. Gerar manifesto com UUIDs dos registros HTTP realmente inseridos, UUIDs das organizações sintéticas, nomes prefixados `vnext-http-rls-` e quantidade esperada, no máximo quatro.
3. Antes de excluir, executar consulta SELECT por igualdade simultânea de UUID, organization_id e nome exato. Abortar se contagens divergirem ou houver qualquer registro não previsto.
4. Usar transação administrativa no SQL Editor isolado, DELETE exclusivamente por essas três condições e verificar `ROW_COUNT` esperado. Depois da exclusão, consultar novamente e confirmar zero registros.
5. Só depois remover memberships e organizações sintéticas por IDs exatos, verificar zero registros e registrar commit e resultados. Nunca usar JWT de usuário final ou habilitar política DELETE ampla.

**Não usar esse protocolo em produção, V2 ou outras instâncias.** Não há autorização para contornar bloqueios de ferramenta. O verificador HTTP permanece desabilitado até integração de limpeza segura, provisionamento de identidades sintéticas e teste de pós-COMMIT efetivamente comprovado.
