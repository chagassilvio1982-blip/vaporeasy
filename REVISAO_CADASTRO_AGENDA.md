# Cadastro e Agendamento — revisão de 26/09/2026

Base: commit `169521928494c69e53732fa86f7a01ca7f1e8549`, conferido byte a byte com a página publicada durante a revisão.

## Alterações

- Busca única de clientes, incluindo nome, telefone e placa; seleção abre consulta, com edição explícita.
- Bloqueio de criação/renomeação que sobrescreveria outro cliente.
- Validação de placa, marca, modelo e vínculo com cliente nos caminhos Cadastro, RG e cadastro rápido.
- Uma placa de outro cliente não troca silenciosamente o cliente selecionado.
- Cadastrar novamente uma placa existente orienta abrir o RG, evitando apagar diagnóstico anterior.
- Limpeza dos campos ao abrir outro RG ou iniciar um novo veículo.
- Marca/modelo com sugestões e digitação livre para versões ausentes do catálogo.
- Remoção do exemplo de ficha e da inclusão automática de veículos de demonstração. Nenhum registro salvo é apagado.
- Preservação da seleção do veículo ao reconstruir as opções da agenda; troca de cliente limpa o vínculo anterior.
- Colaborador e status voltam a ficar habilitados ao retornar ao atendimento único.
- Horário recorrente lido do campo correto; rótulo quinzenal e cálculo local de 14 dias; mensal limitado ao último dia válido do mês.
- Deslocamento recolhido enquanto a recorrência está sem equipe.
- Bloqueio de duplo envio de agendamento e opção de continuar com outro veículo.
- Sincronização serializada: alterações durante leitura impedem aplicar resposta antiga; alterações durante gravação entram em nova gravação.
- Cadastro só informa sincronização concluída depois de resposta efetiva. Erros permanecem como pendência.
- Registro retroativo usa a mesma fila de sincronização.
- Remoção da referência ao arquivo de correção de colaborador ausente; a correção fica integrada às funções originais.

## Verificação

`node --test tests/cadastro-agenda.test.cjs`

23 testes passaram. Cobrem funções reais extraídas do aplicativo, validação, RG, vínculo cliente/veículo, datas, seleção de colaborador/veículo, duplo envio e concorrência de sincronização. Os scripts também passaram pela compilação e pela verificação de referências locais.

Não foram criados nem excluídos clientes, veículos ou atendimentos reais nos testes. Não foram alterados o banco, funções Supabase, Financeiro ou acessos.

## Antes de liberar em produção

O navegador de auditoria estava sem login. Ainda é necessário homologar com sessão autenticada: criar e editar cliente/veículo de teste; fazer dois agendamentos consecutivos; remanejar equipe; concluir, cancelar e recarregar; conferir persistência em dois aparelhos; validar os controles em Android/PWA. Os testes automatizados não substituem essa verificação.

Não foi feita migração de séries antigas, deduplicação destrutiva de dados, transferência de propriedade de veículo nem alteração em agendamentos existentes. Para corrigir placa de veículo com histórico é necessária uma operação própria que preserve vínculos; esta revisão impede que a edição de RG crie acidentalmente outro veículo.

## Publicação e reversão

Publicar `index.html`, `cadastro-agenda-rules.js` e `vaporeasy_fix_v171_registrar_servico_realizado.js` no mesmo commit. Manter os scripts v169, v170, v174 e v175 já existentes. Não instalar este trabalho como mais um script de sobreposição. A reversão é feita revertendo o commit; não há migração de banco neste conjunto.

## Estado da entrega

A criação da branch pelo conector GitHub foi recusada com HTTP 403, `Resource not accessible by integration`, apesar da consulta ao repositório informar permissão de push. Nenhuma alteração foi publicada em produção. A continuação exige liberar a gravação pela integração ou autorizar o uso do GitHub pelo navegador.
