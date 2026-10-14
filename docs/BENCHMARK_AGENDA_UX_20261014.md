# Vaporeasy V2 — benchmark de agendamento e plano de eficiência (14/10/2026)

## Objetivo operacional

Reduzir o número de toques e consultas necessárias para agendar, iniciar e concluir uma visita de estética automotiva em condomínio. Preservar o elo entre cliente, veículo, plano, visita, benefício executado e cobrança.

**Princípio:** não transformar o produto em um ERP genérico. Ações de uso diário visíveis, configurações e relatórios secundários recolhidos. Não adquirir assinaturas adicionais.

## Referências externas pesquisadas

| Aplicativo | Padrão documentado | Adaptação recomendada |
| --- | --- | --- |
| Jobber | Histórico e informações do cliente disponíveis na operação; serviço principal separado das visitas | Contexto do veículo dentro de cada atendimento; histórico e observações sem navegação adicional |
| Housecall Pro | Serviços recorrentes e visitas atribuídas por horário/equipe; jornadas múltiplas | Recorrência independente do contrato de plano; edição de uma ocorrência não altera indevidamente a série |
| Fresha | Perfil 360° com observações, pacotes e alertas próximos do agendamento | Benefícios, alertas e última execução na ficha do veículo; operador não vê preços nem cobrança |
| Trinks | Agenda recorrente com periodicidade, etiquetas e ausência profissional | Controles claros de recorrência, capacidade, exceções e bloqueios |
| Auvo | Acompanhamento da execução por equipe externa e histórico do objeto atendido | Visitas por colaborador, checklist enxuto, status confiável e produtividade |
| Square Appointments | Agenda conectada a profissionais, recursos, pagamentos e registro do cliente | Capacidade por equipe, não uma trava arbitrária global; cobrança ligada ao serviço sem duplicidade |

Documentação consultada:
- https://help.getjobber.com/en/articles/client-information-in-the-jobber-app/
- https://help.getjobber.com/en/articles/jobs-in-the-jobber-app/
- https://help.housecallpro.com/en/articles/2789168-create-a-recurring-job
- https://help.housecallpro.com/en/articles/12892543-appointments-vs-segments-vs-recurring-jobs
- https://www.fresha.com/for-business/features
- https://www.fresha.com/help-center/academy/run-your-business/manage-your-clients/lessons/100296
- https://ajuda.trinks.com/menu-agenda
- https://www.auvo.com/
- https://squareup.com/us/en/appointments/features/recurring-appointments

## Estado encontrado no repositório

- Branch de referência: `feature/v2-enxuta-planos-relatorio-20261014` (não `main`).
- Interface: V2 compacta, menu único, telas de Clientes, Agenda (Mês/Dia/Lista), Financeiro, Relatórios e Operação.
- Implementações recentes em homologação: detalhes de cuidados no atendimento, controle de benefícios reais por plano/veículo, conclusão sem fotografia obrigatória, relatório mensal por veículo. Nem tudo foi validado em celular autenticado.
- Banco isolado: Supabase `wwivmyhlwqyzmaexkmnk`. Produção **não** modificada por esta revisão.
- Arquitetura atual: `index.html` grande, com código e UI acoplados. Refatoração ampla agora criaria risco de regressão; fazer extrações incrementais com testes.
- Listagem Vercel indisponível por permissão 403 nesta revisão. Um commit compilado **não** equivale a teste funcional.

## Entrega desta branch — sem migração e sem integração paga

1. **Busca instantânea na lista mensal da Agenda** por texto já visível nos cartões: cliente, placa, veículo, serviço e responsável. Ignora acentos e pontuação de placa. Sem consulta extra ao Supabase e sem revelar dados de outros perfis.
2. **Botão Hoje** ao lado do seletor de data para retornar à visão diária em um toque. Reaproveita o fluxo existente.
3. Campo de busca mantém o termo ao navegar entre meses; a filtragem reaplica-se após carregar a lista.
4. CSS responsivo e atualização da contagem de resultados.
5. Testes de busca e simulação DOM. Não muda os cálculos, o status de serviço nem as permissões.

## Próximas prioridades (não implementar sem testes correspondentes)

### P0 — Confiabilidade de agenda e dinheiro

- **Contrato de dados explícito:** Plano/assinatura, série de recorrência, ocorrência e serviço realizado são entidades distintas. Uma ocorrência `completed` conta uma vez no mês local. Recorrência avulsa nunca consome benefício contratado.
- **Pagamento idempotente:** conclusão de visita pré-paga não cria segunda cobrança; competência e vínculo `charge/subscription` persistem; todo desconto tem trilha.
- **Cancelamento:** UI pergunta 'Só esta visita' ou 'Esta e próximas'; jamais apagar histórico concluído.
- **Disponibilidade:** bloquear sobreposição real por equipe e recursos, com encaixe administrativo apenas mediante motivo e auditoria. Nunca remover o controle de capacidade globalmente.
- Testes obrigatórios: duas visitas simultâneas, retry/rede instável, recorrência entre meses e fuso São Paulo, pré-pago, desconto, anulação e perfil de operador.

### P1 — Execução em até três ações úteis

- Ao abrir o cartão do dia: cliente, carro/placa, local, observações operacionais e alerta de cuidado; plano e quota do mês se for contratado, sem valor financeiro para colaborador.
- Iniciar e concluir sem exigir foto; fotos somente quando houver justificativa de qualidade.
- Manter evidência de benefício executado com data, atendimento e observação; atualizar saldo sem duplicar evento.
- Busca por placa também na busca geral de clientes **após confirmar a indexação e a política de acesso**. Não consultar dados de clientes indevidamente.

### P2 — Ganhos de produtividade mensuráveis

- Agrupar visitas por condomínio para reduzir deslocamento, sem alterar a escolha manual de horário.
- Expor indicadores mínimos: atendimentos concluídos/equipe/dia, taxa de remarcação, horas operacionais, planos ativos, uso de benefícios, recebimentos efetivos e ticket por veículo.
- Lembretes opcionais e mensagens pré-preenchidas no WhatsApp, após resolver autorização e custos da API; não contratar automações extras agora.

## Checklist de liberação

- [x] Mudança somente em branch de trabalho derivada da versão mais recente.
- [x] Arquivos de UI separados e sem dependências novas.
- [x] Sintaxe dos scripts inline e módulo de busca validada.
- [x] Casos de nomes, placas, limpeza do filtro e atualização da lista simulados.
- [ ] Teste em navegador autenticado da homologação (gestor e operador).
- [ ] Teste Android com alternância Dia/Lista/Mês e retorno ao Hoje.
- [ ] Confirmar prévia Vercel do commit atual e apontamento exclusivo ao banco isolado.
- [ ] Testes completos de regressão financeira/recorrência da branch base ainda pendentes.
- [ ] Aprovação após evidências para integrar e publicar.

## Reversão

Reverter o commit que acrescenta `agenda-quick-search.js`, `agenda-quick.css` e as referências no `index.html`, ou fechar o PR sem merge. Nenhum dado persistente é afetado.

## Incremento operacional executado após benchmark

- Agenda diária administrativa: botões **Iniciar**, **Aceitar solicitação** ou **Concluir serviço** visíveis diretamente no cartão, conforme estado; edição/cancelamento continuam dentro de 'Ações e informações'.
- Observações da visita visíveis diretamente no cartão da agenda administrativa e em 'Meus atendimentos' do colaborador, com escape HTML. Não são expostos preços ao colaborador.
- Confirmação de recebimento e geração de cobrança não foram alteradas.
- Conclusão continua usando o modal existente, sem bypass de validação.
- Teste reproduzível: `tests/agenda-quick/operational-ux.test.cjs` (cinco casos, incluindo estados, notas e segurança).

### Pendências deste incremento

- [x] Validar sintaxe JavaScript inline.
- [x] Validar cartões com estados requested, scheduled, confirmed, in_progress, completed e cancelled.
- [x] Validar observações visíveis e HTML escapado.
- [ ] Validar toques reais em Android e desktop autenticados.
- [ ] Validar captura de início e conclusão com plano e recorrência simples na homologação.
- [ ] Confirmar preview Vercel deste commit e integração com banco isolado.
- [ ] Não liberar produção sem regressão financeira/recorrência e autorização específica para publicação.
