# Vaporeasy V2 — Auditoria da seleção de cobranças e critérios de liberação

**Estado:** implementação em revisão; emissão permanece desabilitada.  
**Branch:** `fix/v2-billing-manual-selection-20261106`  
**PR:** [#35](https://github.com/chagassilvio1982-blip/vaporeasy/pull/35)  
**Supabase:** V2 `asuppjeomaymzromgcrp`

## 1. Escopo implementado na branch

A tela de seleção trabalha com uma competência mensal calculada no fuso `America/Sao_Paulo`, seleciona um cliente e apresenta linhas individualizadas por veículo:

- mensalidades de plano registradas em `package_charges`, com validação de correspondência entre cobrança, assinatura, cliente, veículo e serviço;
- atendimentos concluídos e não excluídos dentro da competência;
- valor financeiro corrigido quando há registro em `appointment_financial_corrections`, com validação de titularidade;
- identificação do veículo em cada linha;
- snapshot imutável versão 3 com nome do cliente, competência, veículo, placa, serviço, data do atendimento, valor e tipo de item;
- compatibilidade de leitura com snapshots versão 2 já existentes;
- prévia exportável, explicitamente identificada como não emitida.

A seleção não altera pagamentos. A emissão continua desabilitada por `selectedReceiptRendererReady=false`.

## 2. Regras de elegibilidade

### Mensalidades de plano

- Somente cobranças `pending` podem ser selecionadas.
- Cobranças `paid`, `covered` e `cancelled` não podem ser cobradas novamente.
- O estado `covered` significa mensalidade quitada por crédito e continua caracterizando cobertura do plano para a visita.
- A mensalidade é identificada por cliente, competência e veículo.

### Atendimentos avulsos

Um atendimento só pode ser selecionado quando:

- pertence ao cliente selecionado;
- está concluído e não excluído;
- sua data local em São Paulo pertence à competência;
- não possui pagamento confirmado;
- não está coberto por assinatura vigente na data do atendimento;
- não está associado a uma recorrência sem correção financeira explícita `avulso`;
- não possui correção financeira classificada como `plan`;
- o valor selecionado corresponde ao valor financeiro recalculado pelo servidor.

Uma correção classificada como `avulso` prevalece sobre o vínculo histórico de recorrência, com valor corrigido auditável. Uma correção classificada como `plan` bloqueia a cobrança avulsa.

### Troca programada de plano

A função `apply_due_package_changes` utiliza `replaces_subscription_id` e `scheduled_effective_on` para trocar a assinatura na data efetiva. A cobertura da assinatura antiga termina nessa data, mesmo quando o registro antigo permanece sem `superseded_at`. A seleção e a função SQL da branch consideram essa relação para não manter cobertura antiga indefinidamente.

Assinaturas inativas sem data de substituição ou encerramento continuam exigindo revisão; não se deve presumir uma data final ausente.

## 3. Proteções no servidor

A função `public.issue_selected_monthly_receipt` na migração da branch:

- exige usuário ativo com perfil `owner` ou `admin`;
- exige competência no primeiro dia do mês;
- serializa emissão por cliente e competência com `pg_advisory_xact_lock`;
- rejeita documentos existentes tanto no histórico legado quanto na nova tabela;
- rejeita linhas duplicadas;
- bloqueia registros e valida status, cliente, competência, plano e pagamento;
- bloqueia linhas financeiras classificadas como plano;
- recalcula o valor a partir do banco, sem confiar no total enviado pelo navegador;
- grava somente um snapshot de documento de cobrança;
- não insere nem atualiza `appointment_payments` ou `package_charges`;
- mantém a unicidade de um documento por cliente e competência.

## 4. Testes automatizados

O workflow `V2 Billing Safety Tests` executa:

1. testes unitários da regra de cobertura e validação da seleção;
2. verificações estáticas de segurança do navegador e SQL;
3. verificação sintática dos scripts JavaScript;
4. integração SQL em PostgreSQL 16 descartável;
5. teste de emissão concorrente: duas solicitações para o mesmo cliente/mês devem resultar em um documento e uma rejeição.

Os testes SQL usam tabelas e funções de autenticação simuladas em banco descartável. Eles não substituem teste autenticado contra a interface e políticas reais do Supabase.

## 5. Diferença observada no Supabase V2

A função `issue_selected_monthly_receipt` existe no Supabase V2, mas sua definição instalada foi encontrada diferente da migração atual desta branch. A definição instalada ainda não contém todos os bloqueios acrescentados nesta revisão, incluindo a rejeição explícita de correção `plan` e o encerramento da cobertura antiga pela data efetiva de substituição.

A tabela `monthly_billing_documents` possui unicidade por cliente/competência e estava sem documentos no momento da auditoria. Nenhuma migração foi aplicada durante esta revisão.

Na leitura de 12/11/2026, foram encontrados 8 registros de assinatura inativa sem `superseded_at` nem vínculo explícito de substituição. Quatro atendimentos concluídos de novembro coincidem com esse histórico. Dois atendimentos de 12/11 estão ligados a novas assinaturas ativas com mensalidades de novembro pagas; a seleção os reconhece como incluídos no plano. Dois atendimentos de 05/11 antecedem o início das novas assinaturas em 06/11; as mensalidades antigas foram canceladas e as novas foram pagas no mesmo mês. Como não existe data efetiva de substituição registrada para o intervalo, esses dois atendimentos permanecem em revisão e não são oferecidos como avulsos automaticamente.

**Ação de negócio pendente:** confirmar se a mensalidade de novembro paga após a troca cobre também os atendimentos de 05/11. Se sim, devem permanecer cobertos pelo plano; se não, o proprietário deve autorizar uma correção financeira explícita para avulso. Nenhum desses registros foi alterado.

**Não aplicar a migração nem liberar a emissão em produção com base apenas no CI.** Primeiro deve ser revisada a diferença entre a função instalada e a versão da branch, com implantação controlada em ambiente isolado.

## 6. Critérios pendentes antes da liberação

- [ ] CI verde no commit final da branch, incluindo o teste de concorrência.
- [ ] Teste E2E autenticado na prévia V2, cobrindo seleção por cliente, competência e veículos.
- [ ] Conferência de um cliente com múltiplos veículos, mensalidade de plano e atendimentos avulsos.
- [ ] Conferência de correções `avulso` e `plan`, inclusive recorrência sem assinatura correspondente.
- [ ] Conferência de assinaturas substituídas antes e depois da data efetiva.
- [ ] Revisão da diferença entre a função instalada no Supabase e a migração da branch.
- [ ] Revisão independente da migração de agenda `20261106_last_start_1600_DRAFT.sql`, que também está no PR.
- [ ] Aprovação explícita antes de aplicar migração, habilitar emissão ou publicar.

## 7. Restrições de operação

Até que todos os critérios acima estejam comprovados:

- manter `selectedReceiptRendererReady=false`;
- não mesclar nem publicar o PR;
- não emitir documentos reais;
- não alterar pagamentos, mensalidades ou correções financeiras;
- não tratar prévia como cobrança emitida ou pagamento recebido.

Este documento descreve a implementação e os critérios de validação; não é uma declaração de liberação para produção.
