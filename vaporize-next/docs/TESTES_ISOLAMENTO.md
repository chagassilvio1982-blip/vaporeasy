# Vaporize Next — Plano de testes de isolamento v0.1
Data: 2026-10-29
Projeto Supabase homologação: cfpvexgkjsqpwhebsoos
Migração base: 0001_multiempresa_base.sql

## Evidência executada
- Migração aplicada com sucesso e leitura posterior confirmou quatro tabelas com RLS e uma política de SELECT por tabela.
- Consulta com role `authenticated` e sem JWT válido retornou zero registros de `vaporize_next.clients`.
- Tentativa de teste transacional com duas empresas fictícias foi BLOQUEADA pelo controle de segurança da ferramenta. Não foi executada, nem deve ser reportada como aprovada.

## Testes obrigatórios pendentes (ambiente isolado autorizado)
1. Criar usuários de teste distintos A e B e duas organizações fictícias A e B.
2. Vincular usuário A apenas à organização A e usuário B apenas à B.
3. Inserir clientes e veículos sintéticos por organização via papel administrativo de testes.
4. Validar com JWT real do usuário A: leitura de A permitida; leitura de B vazia; idem inversamente para B.
5. Validar anon e usuário autenticado sem membership: nenhuma leitura.
6. Validar inserção de veículo de A apontando para cliente B: FK composta deve recusar.
7. Validar que colaborador não consegue criar memberships, elevar role, nem criar/editar/excluir registros enquanto políticas de escrita não estiverem habilitadas.
8. Desativar membership e organização: acesso imediatamente revogado.
9. Inspecionar privilégios de schema e tabelas, configuração de schema exposto na API, e Storage antes de conectar frontend.
10. Executar testes automatizados de regressão com evidências, IDs fictícios e limpeza segura dos dados de teste.

## Critérios de aceite
- Todas as leituras e mutações entre organizações são recusadas pelo banco, não só pela interface.
- Nenhuma conta de teste ou registro sintético fica na produção.
- Evidências dos testes (consultas, respostas, logs sem credenciais) anexadas ao relatório.
- Bloqueios devem ser registrados, não contornados.

## Estado
Plano documentado; teste de duas organizações NÃO EXECUTADO por bloqueio da ferramenta. Bloco 02 continua pendente.
