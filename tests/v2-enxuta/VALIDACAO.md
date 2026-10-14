# Vaporeasy V2 — enxugamento e controles operacionais
Data: 2026-10-14
Alvo: homologação isolada. Não liberar em produção sem aprovação após validação.

## Escopo integrado
- Reaproveita a tela existente de Clientes > Ver veículos: botão contextual "Cuidados do plano" no veículo (visível a proprietário/admin).
- Reaproveita o módulo de controle de plano e suas RPCs já presentes no banco de homologação isolada. Benefícios com data, observações e anulação auditável; visita concluída conta uma vez.
- Na área de Relatórios existente, remove limite de 15 clientes; detalha quantos atendimentos cada veículo recebeu e as datas, inclusive no PDF.
- Preserva diferenciação: serviço agendado não entra nas conclusões, recorrência sem plano não herda benefícios.
- Parte da branch com correção de foto opcional preparada, NÃO aplicada no banco (gatilho ainda ativo em homologação em 14/10).

## Verificações concluídas
- [x] Alteração limitada a index.html, módulo reutilizado e duas migrations já validadas no banco isolado.
- [x] Sintaxe de scripts inline e plan-control.js validada pelo parser JavaScript.
- [x] Comparação Git: +4 commits sobre a branch de finalização sem foto, sem alterações em produção.
- [x] Supabase isolado: get_client_plan_control, register_package_service e void_package_service presentes.
- [x] Preview Vercel automático no branch retorna READY.
- [ ] Execução autenticada no navegador e em celulares reais.
- [ ] Aplicação da migration de retirada do gatilho de foto após checkpoint/rollback recuperável e verificação de permissões.
- [ ] Testes completos de agenda/financeiro com registros isolados.
- [ ] Aprovação expressa antes de qualquer atualização de produção.

## Casos mínimos de aceitação
1. Proprietário seleciona cliente com múltiplos veículos; cada botão abre o histórico do veículo correspondente, mês correto.
2. Cliente sem plano ou com recorrência simples não mostra benefícios falsos; agendamento futuro não conta como realizado.
3. Registro de hidrorrepelente/enceramento com data e observações aparece uma única vez; retry idempotente; anulação auditada.
4. Plano pré-pago com 2 estéticas: ao concluir uma visita, atualiza saldo sem recriar cobrança; extras não são indevidamente incluídos.
5. Relatório de mês com 20+ clientes lista TODOS; 2 veículos do mesmo cliente são discriminados; múltiplas estéticas no veículo mostram datas reais; cancelamentos não entram.
6. Compartilhar PDF inclui todos os clientes e detalhamento por veículo, com total igual ao painel.
7. Finalizar sem foto, com internet, preserva autorização, conclusão única e financeiro correto (após migração em homologação).
8. Teste na garagem sem rede: **não aprovado**. A retirada da foto não torna o banco offline; não confirmar sucesso antes de projeto de armazenamento local/sincronização.

## Reversão
- Reverter a branch/commit da interface para remover apenas o botão, o script e o detalhamento adicional.
- As migrations de controle de serviços não devem apagar histórico de eventos já inseridos.
- Migration de foto não aplicada por esta branch; reverter somente com definição do gatilho/funções e checkpoint validado.
