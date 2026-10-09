# Piloto interno — 09/10/2026

Base: homologacao-isolada-20261005, commit 9e02a95c7bdd574e71d052fc783cec52ffa3ec8f.
Branch independente: feat/cuidados-internos-20261009.
Banco alterado: somente wwivmyhlwqyzmaexkmnk (Homologacao Isolada).

## Entrega desta etapa
Cadastro de cuidados, custo/tempo por execução e simulações mensais com frequência,
impostos/taxas e margem. Custos iniciais vazios. Sem publicação de preços, sem
alteração de contratos, financeiro ou área pública. Histórico de simulações guarda
premissas. Gestão (owner/admin) apenas, com RLS e sem grants para anon.

## Verificado
- Sintaxe JavaScript e testes do cálculo: aprovados.
- Testes transacionais no banco remoto: owner/admin podem ler e inserir;
  operator e identidade nula não leem; operator não insere; anon sem acesso.
  Dados de teste revertidos via ROLLBACK.
- Advisor sem apontamento nas duas tabelas novas. Alertas em funções já existentes
  e configuração de proteção de senhas não foram alterados nesta tarefa.

## Não validado
Tela em navegador e fluxo autenticado completo. Instalação do Chromium falhou.
Integração com registro de execuções/contagem do plano não faz parte deste piloto
de precificação; manter o controle de planos existente até a integração validada.
Não aprovado para produção.

## Rollback
Reverter a inclusão do script em index.html remove a interface. Preservar as duas
tabelas para não perder rascunhos; caso seja necessário desativar seu acesso,
revogar SELECT/INSERT/UPDATE de authenticated em internal_special_care e
SELECT/INSERT em internal_care_simulations. Não apagar tabelas com dados.
