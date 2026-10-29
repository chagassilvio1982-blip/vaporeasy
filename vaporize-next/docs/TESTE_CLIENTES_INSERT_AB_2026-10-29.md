# Vaporize Next — plano de validação de INSERT de clientes (não executado)
Data: 2026-10-29
Projeto exclusivo de homologação: `cfpvexgkjsqpwhebsoos`
Branch: `vaporize-next/isolado-20261029`

## Pré-condições
- Revisar a migração `0005_clients_insert_review_only.sql` e o papel de proprietário da função `can_manage_clients`.
- Confirmar schema `vaporize_next` exposto na API somente no projeto isolado; caso não esteja, não liberar formulário.
- Usar exclusivamente identidades de teste A e B em organizações distintas; nenhuma conta de cliente real.
- Executar os cenários com JWT autenticado real, **nunca** usando `service_role` como cliente.
- Manter transações reversíveis para ensaios de SQL e apagar somente dados sintéticos após o teste.

## Matriz de autorização
| Cenário | Resultado esperado |
|---|---|
| Proprietário ativo A insere cliente A | Permitido |
| Gerente ativo A insere cliente A | Permitido |
| Colaborador ativo A insere cliente A | Negado |
| Proprietário A insere cliente B | Negado |
| Usuário B insere cliente A | Negado |
| Membro desativado A insere cliente A | Negado |
| Organização suspensa A recebe INSERT | Negado |
| Sem JWT ou anon insere cliente | Negado |
| Usuário A tenta inserir com coluna não autorizada | Negado |
| Recuperação de senha em curso | Bloqueado no cliente |

## Evidências obrigatórias
Registrar para cada caso: identidade sintética, organização sintética, status da operação,
SQLSTATE/HTTP status sem tokens, e contagem antes/depois. Validar que falhas não criaram registros.

## Situação
Migração somente versionada; nenhuma aplicação, teste A/B no banco, ou liberação de interface foi comprovada.
Não confundir CI Node com validação RLS real.
