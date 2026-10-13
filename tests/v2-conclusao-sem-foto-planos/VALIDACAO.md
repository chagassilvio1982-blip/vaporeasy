# Vaporeasy V2 — Homologação: finalização sem foto e plano vs recorrência
Data: 2026-10-13
Origem: branch homologacao-isolada-20261005
Alvo inicial: Supabase HOMOLOGAÇÃO ISOLADA (wwivmyhlwqyzmaexkmnk). Não executar em produção.

## Mudanças propostas
1. Conclusão de atendimento em execução sem foto e sem justificativa. Preserva operador autenticado, atribuição, transição de status, responsável registrado no updated_by e carimbo temporal do servidor.
2. Remove o gatilho e duas verificações internas que impediam concluir sem foto. Não elimina imagens ou registros antigos.
3. A agenda trata como visita de plano SOMENTE agendamentos cujo recurring_plan_id está vinculado a package_subscriptions; recorrência simples nunca vira plano por inferência.
4. Ao concluir visita do plano, consulta o número de visitas previstas e a contagem de visitas concluídas do mês de competência, e alerta para atingimento da quantidade (não cria cobrança extra automática).
5. A cobrança individual permanece delegada aos mecanismos existentes de banco: plano contratado não é cobrado de novo pela visita incluída; recorrência sem plano e avulso geram contas a receber ao concluir; extras do plano podem gerar cobrança adicional.
6. Fotos e laudos do RG do veículo permanecem; fotos históricas de finalização não são apagadas.

## Pré-condições para homologação funcional
- Checkpoint de banco isolado recuperável e versionamento Git
- Confirmar que o front de homologação aponta apenas para o banco isolado
- Aplicar migration nesta base SOMENTE após o checkpoint
- Testar com perfil proprietário, gerente, colaborador

## Testes de aceitação pendentes (executar com registros de teste)
- [ ] Agendamento avulso em execução => confirmar sem câmera/justificativa, status completed, completed_at pelo servidor, pagamento individual pending.
- [ ] Recorrência sem plano => concluir, contabilizar visita no mês, pagamento individual pending; próxima recorrência não sofre alteração.
- [ ] Plano Essencial/Plus/Premium com visitas previstas => concluir, contabilizar uma única visita, SEM nova cobrança individual pela visita incluída.
- [ ] Plano pago antecipadamente => concluir e não duplicar cobrança, recibo mostra pagamento do plano e competência correta.
- [ ] Visita do plano com extra => apenas extra realmente adicional pode ir a receber.
- [ ] Ao atingir quantidade prevista => alerta; nenhuma cobrança automática de excedente sem confirmação comercial.
- [ ] Duplo clique ao concluir => atualização única; não multiplicar visita ou lançamento.
- [ ] Colaborador não atribuído / serviço fora do dia / status já encerrado => bloqueio preservado.
- [ ] Fotos de conclusão já registradas => histórico preservado.
- [ ] Fotos do RG continuam disponíveis.
- [ ] Retroativos e cancelamentos => mantêm regras existentes.
- [ ] Conferir relatórios e comprovantes por competência; faturado != recebido != pagamentos confirmados.

## Verificações efetuadas
- [x] Inspeção de funções e triggers da homologação isolada.
- [x] Compilação e execução transitória da migration sob BEGIN/ROLLBACK com verificação do gatilho removido na transação.
- [x] Gatilho original confirmado presente após rollback.
- [x] Inspeção estática dos controles e IDs da interface; sem referências a campos eliminados.
- [ ] Testes funcionais de interface e banco após aplicação efetiva na homologação.
- [ ] Validação de preview/deploy; conector Vercel retornou 403 em listagem de deploys.
- [ ] Aprovação e publicação em produção.

## Achado a conciliar, sem ações destrutivas
Na HOMOLOGAÇÃO ISOLADA foram detectadas quatro visitas concluídas de planos com extras zero e pagamentos individuais pendentes de R$ 307,50 cada. Consultar origem e competência, verificar snapshots e histórico; jamais cancelar/corrigir lançamentos sem reconciliação.

## Observações sobre limites
O contador informa total previsto/concluído para a competência, mas não converte automaticamente excedentes em serviços cobrados. Não declarar fluxo aprovado até executar testes funcionais.
