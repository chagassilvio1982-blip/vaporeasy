# Bloco 2 — preparação manager/collaborator — 2026-10-30

## Escopo
Somente cfpvexgkjsqpwhebsoos, branch vaporize-next/isolado-20261029. Não modificar V2/V3, BarberGestão, produção ou domínios.

## Evidências desta execução
- Lidos CONTINUIDADE_E_EVIDENCIAS_2026-10-30.md, EXECUCAO_OWNER_2026-10-30.md e AMBIENTES_CONFIRMADOS.md na branch autorizada.
- O registro EXECUCAO_OWNER é posterior ao estado sem memberships descrito na continuidade: owner já vinculado; não recriar.
- Conector SQL funcional via link_6ada8db073e081919421cf5907e1abb9. Inspecionadas apenas colunas de clients/memberships/organizations e definições de políticas, sem repetir testes SQL aprovados.
- Policies de clients retornadas: next_clients_read (SELECT, is_member) e next_clients_insert_owner_manager (INSERT, can_manage_clients). Não há política DELETE.
- Formulário oficial /dashboard/project/cfpvexgkjsqpwhebsoos/auth/users redirecionou para login no navegador desta execução. A sessão do navegador pessoal não foi presumida disponível aqui.
- Nenhuma conta Auth criada, nenhuma membership alterada, nenhum POST/JWT executado nesta etapa.
- Script check-rest-insert-rls.mjs continua bloqueado deliberadamente. Não foi removido o fail-closed.

## Preparação das identidades
Criar duas identidades sintéticas distintas pelo Supabase Auth oficial, com emails de teste definidos no formulário e senhas aleatórias não registradas em código, conversa ou evidências. Não reutilizar contas pessoais. Registrar somente UUIDs e finalidade após sucesso confirmado. Vincular ambos à organização 4eed149d-2907-4604-8d92-ecf212762664, status active, respectivamente manager e collaborator, verificando a identidade antes de qualquer INSERT. Nunca escrever diretamente em auth.users nem fabricar JWT.

## Matriz HTTP pendente
Validar sessão com Auth /user antes das requisições. Cada papel deve ter sub distinto e membership correspondente.
- manager -> POST clients na organização de homologação: HTTP 201 e linha com UUID/organização esperados.
- collaborator -> SELECT da fixture permitida: HTTP 200 e fixture visível.
- collaborator -> POST clients na mesma organização: HTTP 403 e código Postgres 42501. Erros 401, 404, 429 ou 5xx não comprovam RLS.
- manager -> POST em organização isolada sem membership: HTTP 403 e 42501; verificar administrativamente ausência da linha.
- owner -> POST ainda pendente conforme registro anterior; requer sessão oficial, sem redefinir senha ou recriar conta.
- Cross-tenant SELECT: HTTP 200 com array vazio, após confirmar administrativamente que a fixture existe.

## Estratégia de limpeza pós-COMMIT (preparada, ainda não executada/integrada)
1. Antes dos POST, gerar manifesto sem segredos contendo run_id, IDs UUID pré-alocados dos clients, organization_id e name exatos. Salvar o manifesto antes da escrita para cobrir timeout com COMMIT desconhecido.
2. Criar somente fixtures com name vnext-http-rls-<run_id>-<caso>, phone NULL, notes com o mesmo marcador. Não usar dados reais.
3. Executar limpeza administrativa pelo conector SQL autorizado, nunca via JWT de owner e sem adicionar DELETE policy. Para cada linha exigir simultaneamente id, organization_id, name e notes iguais ao manifesto; usar parâmetros UUID/text validados e SQL seguro.
4. Executar em transação: SELECT dos IDs do manifesto; abortar se qualquer linha encontrada divergir do manifesto; DELETE das correspondências exatas RETURNING id; COMMIT. Não usar DELETE amplo por prefixo ou apagar toda a organização.
5. Em consulta administrativa independente, verificar count(*)=0 para TODOS os IDs reservados, inclusive tentativas que deveriam ser negadas e respostas com timeout. SELECT sob RLS não serve como prova de remoção.
6. Executar limpeza mesmo após falhas e guardar resultados sem tokens. Se falhar, registrar UUIDs residuais e interromper testes adicionais.
7. Não remover organização de homologação nem owner. Uma organização secundária descartável, se necessária, deve ter UUID próprio no manifesto e ser removida somente após verificar dependências e ausência de dados alheios ao teste.
8. Manter as duas contas de homologação para continuidade; encerrar sessões de teste e remover acesso temporário quando aplicável. Eventual exclusão Auth será pelo fluxo oficial, nunca DELETE direto em auth.users. Remover membership antes de excluir conta evita que JWT ainda válido preserve acesso por associação.

## Bloqueio e retomada
Necessária autenticação segura no painel acessível ao agente para chegar aos formulários Auth. Nenhuma senha, token ou chave deve ser enviada na conversa. Após acesso, preparar os formulários e solicitar somente a intervenção exigida na criação/credenciais. Não declarar usuários, vínculos ou HTTP concluídos antes das respectivas evidências.
