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
- [x] Preview Vercel de commit anterior no branch retornou READY; a publicação do commit novo de benefícios ainda não foi confirmada (listagem Vercel retorna 403).
- [ ] Execução autenticada no navegador e em celulares reais.
- [ ] Aplicação da migration de retirada do gatilho de foto após checkpoint/rollback recuperável e verificação de permissões.
- [ ] Testes completos de agenda/financeiro com registros isolados.
- [ ] Aprovação expressa antes de qualquer atualização de produção.

## Benefícios incluídos por plano e veículo — 14/10
- [x] Migration aditiva `20261014_package_included_benefits.sql` aplicada apenas na base Supabase **wwivmyhlwqyzmaexkmnk**.
- [x] Nova tabela com RLS, leitura para proprietário/ADM, escrita somente por RPC autorizada; duas RPCs presentes, sem permissão INSERT direta a autenticados.
- [x] Configurações começam vazias: NÃO inventar benefícios Premium, Essencial ou Plus por nome do plano.
- [x] Admin pode definir benefício previsto por mês ou por visita e vigência; histórico de meses anteriores é preservado ao encerrar a partir de mês atual.
- [x] A tela Detalhes do atendimento exibe quota de estéticas, benefícios incluídos, realizados/pendentes, datas, e eventos vinculados àquele atendimento.
- [x] Modal de controle seleciona a competência correta do agendamento de origem e permite registrar benefício realizado sem cobrança.
- [x] Testes JavaScript determinísticos de contagem pendente/concluída, excedente e vigência + parse dos scripts inline.
- [ ] Testes autenticados em celular e confirmação do deploy atualizado (Vercel 403 no conector de listagem).
- [ ] Teste real com contrato Premium e preenchimento manual da lista correta de benefícios, sem qualquer lançamento financeiro indevido.
- [ ] Teste de fluxo sobreposto entre dois dialogs, atualização após inclusão e encerramento de benefícios.
- [ ] Reconciliar serviços legados que não estejam vinculados à estética pelo appointment_id; não inferir vínculo por data.
- [ ] Validar conteúdo de benefícios com responsável comercial antes de cadastrar o que foi contratado.

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


## Resumo automático no atendimento — solicitação de 14/10
- [x] Ao selecionar um cliente, a lista dos veículos abre automaticamente, com um resumo por veículo: plano, quantidade concluída, benefícios realizados/pendentes, datas, últimas estéticas e observações do veículo, sem navegar até "Cuidados do plano".
- [x] Ao iniciar atendimento no painel administrativo, abre automaticamente "Detalhes do atendimento"; o controle de plano e suas datas já aparecem ali.
- [x] Ao tentar concluir um atendimento, a tela de confirmação inclui um resumo de cuidados e notas sem exigir nova navegação.
- [x] Em "Meus atendimentos" do operador, a ficha do veículo exibe resumo automaticamente antes das ações. Após "Iniciar serviço", o cartão recarrega com a informação, sem novo clique.
- [x] Para recorrência sem plano, o resumo informa claramente que não há benefício de plano vinculado; mantém últimas visitas e observações, sem inferir mensalidade.
- [x] Nova função `appointment_care_brief(uuid)` aplicada **apenas** em Supabase de homologação isolada. Restrição de operador: apenas agendamento atribuído no dia; dados financeiros não são retornados; `anon` não pode executar.
- [x] Sintaxe JavaScript verificada. Testes determinísticos do resumo: mensal, por visita, situação realizada/pendente, ausência de plano e escape de observações.
- [ ] Teste autenticado real com proprietário e operador no celular, com e sem plano; conferir carregamento inicial e troca de cliente.
- [ ] Medir latência das leituras na agenda em local com internet ruim. Não existe modo offline.
- [x] GitHub registrou status **Vercel: success** para o commit do checklist 1f19a14e; detalhe https://vercel.com/vaporeasy/vaporeasy/Bk1Sid1AzPGcnERvHRTLAe8wqhRu. O conector Vercel não disponibilizou URL única do novo preview, e ainda não houve E2E autenticado.
- [ ] Confirmar que descrição de benefícios foi preenchida, pois tabela de benefícios configurados está vazia até cadastro administrativo.
- [ ] Publicação em produção somente após aprovação.
