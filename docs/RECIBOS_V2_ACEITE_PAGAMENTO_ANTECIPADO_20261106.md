# V2 — Critérios de aceite: cobrança antecipada e seleção por veículo

Status: especificação e testes de aceitação; não implica publicação nem migração executada.
Ambiente: branch feature/v2-recibos-central-prod-base-20261106. Não escrever no banco operacional.

## Caso Euripídio — novembro/2026
- Ferrari 296 GTS: pacote novembro, R$ 780,00, a receber antes da execução.
- Mercedes-Benz G63: pacote novembro, R$ 820,00, a receber antes da execução.
- Porsche 718 Cayman: polimento avulso, valor a confirmar, **não** integra a mensalidade.
- Outubro: pacotes pagos, preservar status, competência e comprovantes originais.
- Total **somente dos dois pacotes de novembro**: R$ 1.600,00. Não adicionar R$ 780,00 da Porsche.
- A UI deve mostrar competência, vencimento/pagamento e execução como dimensões independentes. Pagamento antecipado não significa atendimento concluído.

## Comportamento obrigatório
1. Selecionar explicitamente veículos e linhas de cobrança, com modalidades pacote/avulso/extra.
2. Ao desmarcar Porsche, recalcular prévia sem alterar cadastro, contrato ou lançamento.
3. Emissão de cobrança antecipada usa título "Cobrança — novembro/2026", nunca "Recibo pago" enquanto pendente.
4. Mostrar status financeiro independente de quantidade de atendimentos executados.
5. Um recibo de pagamento só pode declarar recebimentos efetivamente confirmados.
6. Agrupamento não deve criar novos débitos, alterar lançamentos pagos nem duplicar mensalidades.
7. Serviços avulsos pertencentes a terceiros precisam de vínculo correto de cliente/pagador antes de emitir documento.
8. Documentos já emitidos são imutáveis: corrigir por nova versão retificadora, preservando histórico e trilha de auditoria.
9. Fonte de verdade dos valores e status: servidor; navegador envia somente IDs de origem e seleção.
10. Impedir seleção entre clientes diferentes; autorização financeira validada no backend.

## Matriz de testes
| ID | Cenário | Resultado esperado |
| --- | --- | --- |
| A01 | Selecionar Ferrari + G63 em novembro | R$ 1.600,00 a receber |
| A02 | Selecionar Porsche indevidamente como pacote | UI não presume plano; exibe somente contrato real validado |
| A03 | Desmarcar Porsche | Prévia exclui Porsche, sem mutação financeira |
| A04 | Outubro já quitado | Nenhuma nova cobrança nem alteração no status pago |
| A05 | Pagamento antecipado de novembro | Status pago, atendimentos ainda pendentes |
| A06 | Dois atendimentos executados depois de pagamento | Saldo de cobrança permanece zero, saldo de visitas diminui |
| A07 | Polimento avulso Porsche | Documento próprio, preço confirmado na origem |
| A08 | Reenvio da cobrança | Mesmo identificador e total, sem novo lançamento |
| A09 | Tentativa de marcar como pago pela prévia | Bloqueada; baixa exige fluxo autorizado |
| A10 | Dois cliques na emissão | Um único snapshot lógico |
| A11 | Usuário colaborador | Acesso financeiro negado |
| A12 | Retificação de documento já emitido | Nova revisão; original preservado |

## Gate de publicação
- Executar testes automatizados e inspeção visual Android.
- Usar ambiente de banco isolado ativo, sem copiar dados reais desnecessariamente.
- Revisar diferenças contra a versão efetivamente publicada na Vercel.
- Sem aprovação explícita, não publicar em produção.
