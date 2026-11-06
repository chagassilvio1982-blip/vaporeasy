# Auditoria Vaporeasy V2 — achados verificados em código — 06/11/2026

Escopo: inspeção estática de index.html e v2-documento-misto-previa.js na branch de trabalho. Sem acesso confirmado aos dados de produção. Não afirmar testes de interface ou de banco.

## P0 — cobranças incorretas
1. getReceiptGroupData soma receiptAmounts(d).final de cada atendimento selecionado sem conciliar com package_charges; quando há visitas de plano, isso pode cobrar a mensalidade novamente.
2. getMonthlyClientReceiptData soma final_value ou appointment_payments.amount por visita, sem vincular a mensalidade package_charges. Esse fluxo pode emitir documento de cobrança enganoso.
3. groupReceiptHtml usa allPaid/nonePaid de appointment_payments, que não representa necessariamente o status de pagamento antecipado de package_charges.
4. financePackageGroupCard agrupa por cliente e competência, mas soma todas as cobranças da competência; antes de confirmar/compartilhar, validar unicidade por assinatura e competência, além de upgrades e créditos.

## Mitigação aplicada
- getReceiptGroupData: recusa documentos mistos com atendimento de plano, orientando usar cobrança de mensalidade.
- getMonthlyClientReceiptData: recusa documento mensal baseado em visitas quando contém recurring_plan_id.
- Prévia isolada: detecta duplicidade por subscription_id + competência e desabilita compartilhar/imprimir quando selecionada.
- Não modifica dados, contratos, pagamentos ou produção.

## Pendências P0
- Conciliar package_subscriptions, package_charges, appointments, appointment_payments e appointment_addons por contrato, competência e veículo.
- Verificar registros reais de Cezar Negrão: contrato, quantidade de cobranças de novembro, pagamento de outubro e avulso do Honda.
- Validar criação de mensalidades no servidor com unicidade transacional (subscription_id, competence_month) e idempotência.
- Garantir que extras tenham lançamento próprio e não gerem outro pacote.
- Impedir compartilhamento também de documentos legados/snapshots incorretos, com revisão auditável e sem apagar histórico.
- Testes reais com permissões e dados anonimizados; não publicar sem aceite.

## P1 — usabilidade
- Central única: cliente → competência → veículos/pacotes → + extra → documento.
- Prévia com subtotal por veículo, total contratado, recebido, saldo, visitas executadas separadas.
- Estados claros: cobrança, recibo de pagamento, demonstrativo.
- Modal responsivo com resumo fixo e poucas ações.

## P2 — demais áreas
- Agenda: testar recorrência quinta→sexta na virada de mês (Euripídio).
- Autenticação: logout, redefinição de senha, sessão e permissões.
- Financeiro: pagamento em lote, descontos, histórico, recibos imutáveis.
- Fluxos operacionais: concluir/iniciar, rede instável, dados duplicados, acessibilidade Android.

## Critério de liberação
Sem bloqueios P0, testes automatizados e integrados aprovados, validação mobile, conferência financeira com cliente real e autorização explícita para publicação.
