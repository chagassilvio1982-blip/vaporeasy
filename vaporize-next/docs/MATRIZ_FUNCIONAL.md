# Vaporize Next — Matriz funcional inicial v0.1
Data: 2026-10-29
Origem: requisitos operacionais relatados e inspeção de `v2-staging/index.html`. Não representa testes funcionais concluídos.

| Bloco | Requisito | Aceite mínimo |
|---|---|---|
| 03 | Login, sessão e recuperação de senha | Fluxo de callback validado; senha somente com sessão válida; sessão encerrada após redefinição; módulos internos inacessíveis |
| 03 | Proprietário, gerente e colaborador | RLS e autorizações de servidor verificadas por papel e empresa |
| 04 | Dashboard e navegação mobile-first | Navegação sem recarregamento indevido; telas de erro, vazio e carregamento |
| 05 | Clientes, condomínios e veículos | Busca, vínculo cliente-veículo, histórico, RG e fotos opcionais |
| 06 | Serviços, preços, adicionais e equipes | Catálogo editável por empresa; papéis e responsáveis |
| 07 | Agenda com calendário sempre visível | Início 7h30 configurável; grade de 20 min configurável; duração por serviço; prevenção de conflitos |
| 07 | Recorrência | Semanal/quinzenal/mensal; isolamento por competência; cancelamento sem duplicar |
| 08 | Execução e conclusão | Iniciar antes do horário; concluir sem foto obrigatória; registrar justificativa e auditoria |
| 09 | Planos Essencial/Plus/Premium | Frequências, portes M/G, descontos e benefícios com validade |
| 10 | Financeiro | Faturado, recebido, a receber, despesas, relatórios mensais |
| 10 | Documentos | Orçamentos e recibos agrupados com identificação da empresa |
| 11 | Comercialização SaaS | Onboarding de empresa, isolamento de dados e configurações, assinatura sem acesso cruzado |

## Regras de implantação
- Nenhum requisito acima implica implementação pronta.
- A nova UI será construída separadamente do HTML monolítico V2/V3.
- O schema `vaporize_next` é independente; dados reais da V2 não serão copiados sem aprovação e plano de migração.
- Não expor schema via API sem revisar configuração, privilégios e testes.

## Pendências de levantamento
- Revisar código de agendamentos e financeiro V2 em detalhe, comparando com os comportamentos aceitos.
- Definir especificação de estados da agenda, política de cancelamento e valores por porte.
- Validar modelo de permissões com dois usuários de teste de empresas distintas.
