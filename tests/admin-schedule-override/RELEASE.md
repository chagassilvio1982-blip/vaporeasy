# V2 — publicação do encaixe autorizado pelo ADM

Autorização do usuário: publicar a correção na V2 principal em 08/10/2026.
Base de produção preservada: 43b0198683cdc3f3ba5e8a014fff1646789702f5 (v2-staging).
Checkpoint Git: backup/v2-pre-admin-override-20261009.
Frontend anterior da V2: dpl_5AChNKWBazJC4FXRPEA6y83ztiaU.
Frontend anterior dos aliases principais: dpl_DYXc8ywxRwafewndQrWzw8qJ6p4J.
Banco alvo: asuppjeomaymzromgcrp. Homologação de teste: wwivmyhlwqyzmaexkmnk.

## Mudança

Encaixe pontual de ADM/Proprietário: horário manual, justificativa e confirmação. Libera capacidade e sobreposição da equipe, mantendo a proteção contra sobreposição do mesmo veículo. Não contrata planos nem cria/edita recorrências. Planos existentes ficam ativos. Remanejamento exige cancelar e criar novo encaixe.

## Evidência executada

- 14 cenários aprovados no banco isolado, todos em transação com ROLLBACK: autorização, capacidade/equipe, auditoria, idempotência, duplicidade do veículo, falsificação, operador, auth nulo, anon sem EXECUTE, ADM inativo, preservação de recorrência, leitor tipado, cancelamento e conclusão.
- DOM da versão de produção aprovado com jsdom 26.1.0 e RPC simulado. Scripts inline analisados com Node. Confirmado frontend apontando para o banco de produção.
- Auditor de segurança executado. RPC SECURITY DEFINER é intencional e exige usuário ativo com role owner/admin. PUBLIC e anon não têm EXECUTE.
- Login real e E2E autenticado em navegador não executados. Essa limitação foi comunicada antes da autorização de publicação e novamente antes da migração.

## Rollback

Retornar o alias da V2 ao deployment dpl_5AChNKWBazJC4FXRPEA6y83ztiaU; aliases principais podem voltar a dpl_DYXc8ywxRwafewndQrWzw8qJ6p4J. Reverter somente o diff do encaixe no branch atual, preservando commits posteriores. Aplicar disable-new-overrides.sql para bloquear novas autorizações. Preservar os registros já autorizados, suas colunas de auditoria e a validação necessária para conclusão/cancelamento. As definições originais das funções estão arquivadas como production-before-*.sql; não restaurar cegamente o leitor tipado enquanto as colunas adicionais existirem. Uma reversão integral do schema exige avaliar as sobreposições autorizadas existentes; não apagá-las.
