# V2 — Pacote + extras no mesmo documento (contrato funcional)

Status: especificação de implementação. Não altera produção.

## Objetivo
Permitir adicionar serviços extras ao veículo que já possui pacote mensal, sem criar novo orçamento ou novo recibo para cada extra. O documento consolidado é uma apresentação de lançamentos existentes, não um novo débito.

## Fluxo mobile
1. Cliente e competência (mês) → carregar veículos e pacotes da competência.
2. Cartão de cada veículo: pacote, situação de pagamento, visitas realizadas/restantes; botão **+ Adicionar serviço**.
3. Adicionar extra: selecionar serviço do catálogo, preço vigente sugerido (editável conforme permissão), quantidade, desconto e data prevista/realizada. Confirmar cria **uma única linha de extra vinculada ao veículo e competência**, não um segundo pacote.
4. Resumo único: subtotal por veículo; total contratado, total recebido e saldo a receber; compartilhar cobrança ou demonstrativo conforme status.

## Casos de aceite
- Dois carros com Plano Essencial; polimento no carro A e ozônio no carro B → um demonstrativo com duas seções, cada uma contendo pacote e extra.
- Pacote pago antecipadamente, extra adicionado depois → exibir pacote como pago, extra como pendente; não cobrar pacote novamente.
- Extra pago em outro dia → atualizar recebido/saldo sem recriar pacote ou duplicar lançamento.
- Cliente com três carros: Ferrari + G63 no documento conjunto; Porsche Cayman de terceiro em documento separado, com pagador correto.
- Pacote de outubro quitado não aparece como nova cobrança em novembro.
- Extra cancelado/estornado → manter histórico de eventos, sem exclusão destrutiva.
- Serviço extra já incluído no pacote → sinalizar possível duplicidade e exigir confirmação autorizada antes de cobrança.
- Reabrir prévia não deve criar novos débitos; compartilhamento repetido não duplica lançamentos.
- Documento já emitido deve preservar snapshot; mudanças geram revisão/retificação auditável.

## Modelo de dados mínimo (proposta; validar schema existente antes de qualquer migração)
- Linha financeira: id, client_id, vehicle_id, competence_month, source_type (subscription|extra), source_id, description_snapshot, unit_price, quantity, discount, total, status.
- Pagamento: id, amount, paid_at, method, external_reference; alocação de pagamento por linha, inclusive parcial.
- Extra: id, client_id, vehicle_id, competence_month, service_id, quantity, unit_price, discount, execution_status, scheduled_at, performed_at.
- Documento: id, client_id, competence_month, revision, kind (charge|payment_receipt|statement), immutable_snapshot, created_at.
- Índice único por (source_type, source_id) para impedir duplicação lógica de linhas.
- Aplicar autorização de acesso e regras RLS no servidor; nunca confiar em total calculado no navegador.

## UX e texto
- Botão principal: **Gerar documento**.
- Ações secundárias: **Adicionar serviço**, **Separar cobrança**, **Ver pagamentos**.
- Usar **Cobrança** para saldo pendente, **Recibo de pagamento** somente para valores confirmados e **Demonstrativo** para visão consolidada.
- Se um documento contiver itens pagos e pendentes, mostrar explicitamente ambos e o saldo, sem afirmar que tudo foi pago.
- Não exigir novo orçamento quando o extra já tem preço autorizado; se preço estiver ausente, exigir confirmação antes de cobrar.

## Gate
Implementar em branch isolada, executar testes automatizados e teste Android. Não publicar na V2 operacional sem validação dos dados reais e autorização.
