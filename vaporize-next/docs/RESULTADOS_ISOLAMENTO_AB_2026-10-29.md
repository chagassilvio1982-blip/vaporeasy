# Execução de isolamento A/B — 2026-10-29

Ambiente exclusivo: Supabase `cfpvexgkjsqpwhebsoos`, schema `vaporize_next`.

## Método
Testes SQL em transações com `BEGIN` e `ROLLBACK`; identidade já existente foi referenciada **apenas transitoriamente** por ID sem expor seus dados ou modificar sua conta. Criadas organizações, memberships e clientes exclusivamente dentro das transações revertidas. Simulação `SET LOCAL ROLE authenticated` e `request.jwt.claim.sub` via `set_config`. **Não são testes com JWT real via HTTP**.

## Resultados observados
| Caso | Resultado |
|---|---|
| Proprietário A insere cliente na organização A | Permitido |
| Proprietário A tenta inserir na organização B, sem vínculo B | Bloqueado: SQLSTATE 42501, RLS |
| Colaborador ativo tenta inserir na própria organização | Bloqueado: SQLSTATE 42501, RLS |
| Proprietário com vínculo disabled tenta inserir | Bloqueado: SQLSTATE 42501, RLS |
| Gerente ativo insere na própria organização | **Não executado**: chamada bloqueada pela ferramenta |
| Gerente A insere na organização B | Pendente |
| Organização suspensa | Pendente |
| JWT real e PostgREST / REST schema exposure | Pendente |

Após a execução, consulta de contagem: **0 organizations, 0 memberships, 0 clients**.

## Decisão
A matriz SQL parcial confirma isolamento para proprietário e negativas de colaborador/vínculo desativado. Não declarar homologação completa nem habilitar interface até validar gerente, organização suspensa e HTTP/JWT real. Nenhuma mudança na V2, produção ou domínios.
