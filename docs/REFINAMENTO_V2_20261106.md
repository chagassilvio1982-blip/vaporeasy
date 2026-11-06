# Refinamento Vaporeasy V2 — 06/11/2026

## Resultado e alcance

Base analisada: `a024304`, branch `feature/v2-recibos-central-prod-base-20261106`.
Implementação isolada: `feature/v2-refinamento-mobile-20261106`.
Não foram feitas alterações no banco, pagamentos, produção ou funções remotas. A análise do aplicativo principal é estática; os testes de navegador usam demonstração com dados fictícios e o mesmo módulo de prévia do aplicativo.

Não é uma liberação operacional. O fluxo de gravar extras independentes, emitir documentos imutáveis e validar permissões no servidor permanece pendente de homologação integrada.

## Diagnóstico com evidências

| Área | Constatação | Consequência / decisão |
|---|---|---|
| Agenda | `index.html` já oferece Dia/Mês/Lista, busca por cliente/placa e botão Agendamento. Registrar serviço realizado fica em Mais opções. | Preservar navegação estável; considerar ação contextual de extra no veículo, sem duplicar agendamento. Não foi cronometrado uso real. |
| Clientes e veículos | Cadastro, RG e orçamento possuem fluxos próprios; revisão anterior documenta proteções contra troca de cliente e duplicação de placa. | Reutilizar IDs e vínculo existente; não criar outro cadastro para cobrança. Não repetir revisão geral já registrada. |
| Planos | `package_charges` registra competência, pagamento e limite de visitas. Financeiro carrega visitas concluídas separadamente. | Pagamento e execução precisam continuar independentes. Exibir realizadas/restantes usando limite da competência. |
| Extras | `loadFinance` exclui de `serviceApps` todos os atendimentos vinculados a planos. Existem `appointment_addons` e `addon_value`. | Um extra no atendimento de pacote requer conciliação própria. A prévia agora sinaliza essa situação, sem inventar dívida nem considerar o extra quitado. |
| Financeiro | Documentos mensais de atendimentos e mensalidades aparecem em seções/caminhos diferentes. `loadFinance` também combina visão de competência com recebimentos por data de caixa. | Manter os conceitos explícitos. Consolidar apresentação não pode criar lançamento financeiro. |
| Recibos | Base já tinha atalhos e seleção por linha. Valores ausentes viravam zero; valor de serviço pago era substituído pelo pagamento divergente. | Corrigidos bloqueio de preço ausente e separação contratado/recebido/saldo. Divergências continuam exigindo conferência. |
| Navegação | Atalhos Recibos já existem no menu, agenda e financeiro. Atualizar financeiro fica em Mais opções. | Não recriar atalhos. Próxima melhoria: atualização explícita/estado de carregamento, após validar concorrência do carregamento. |
| Mobile | Lista interna com altura fixa de 260px criava rolagem dentro do painel; documento usava tabela com cinco colunas. | Removida rolagem interna; ações fixas no painel; documento vira blocos em tela estreita. |
| Arquitetura | `index.html` tem 6.273 linhas; vários scripts históricos de correção coexistem. | Alteração limitada ao módulo existente; não introduzido outro framework, dependência ou mensalidade. |
| Isolamento | `index.html` aponta para `asuppjeomaymzromgcrp.supabase.co`; nome de função contendo staging não comprova banco isolado. | Não usar essa página para testes de escrita. Demonstração separada usa CSP `connect-src 'none'`. |
| Testes | CI da base executava somente antecipados; teste preview tinha expectativa textual antiga (`serviço` em vez de `visita`). | Atualizado teste e workflow para executar os quatro arquivos de recibos na nova branch. |

## Prioridades técnicas

Escala qualitativa, sem estimativas de horas ou percentuais. Custo é manutenção relativa, não orçamento monetário.

| Ordem | Melhoria | Impacto | Facilidade para usuário | Redução de erros | Complexidade | Manutenção | Situação |
|---|---|---|---|---|---|---|---|
| 1 | Proteger valores, competência, origem e seleção de veículo | Alto | Alta | Alta | Baixa | Baixa | Implementado na prévia |
| 2 | Extra por veículo, com preço autorizado e identidade única | Alto | Alta | Alta | Alta | Média | Fluxo visual simulado; persistência pendente |
| 3 | Consolidar por responsável financeiro confirmado | Alto | Alta | Alta | Média | Média | Bloqueio de divergência explícita na prévia; vínculo servidor pendente |
| 4 | Emissão imutável e retificação por revisão | Alto | Alta | Alta | Alta | Média | Contrato técnico definido; não implementado |
| 5 | Um toque para selecionar carro, ações visíveis e documento legível | Alto | Alta | Média | Baixa | Baixa | Implementado |
| 6 | Visitas realizadas/restantes separadas do pagamento | Alto | Alta | Alta | Baixa | Baixa | Implementado no modelo existente |
| 7 | Atualização e filtro financeiro com estado claro | Médio | Alta | Média | Média | Baixa | Recomendado; não alterado |
| 8 | Melhorias gerais de agenda/RG | Médio | Média | Média | Média | Média | Preservadas; avaliar após central integrada |

## Proposta de experiência e cliques

Cliente + competência → cartões por veículo → selecionar itens → visualizar/compartilhar.
Cada cartão apresenta pacote, recebimento, saldo e execução. Na proposta visual, “Simular serviço extra” abre catálogo/preço e adiciona uma linha de teste ao veículo, sem outro orçamento.

Medição estrutural e observação no protótipo, não estudo de produtividade:
- Desmarcar um carro com N linhas: antes N marcações individuais; agora 1 toque no cabeçalho.
- Abrir extra na proposta: 1 toque no cartão; escolher serviço/valor e confirmar. A digitação e escolhas dependem do caso, por isso não há total universal de cliques.
- Abrir documento pelo aplicativo mantém atalho existente → montar documento → selecionar cliente, quando houver mais de um. Não foi prometida redução nesse caminho sem teste autenticado.
- Não há orçamento intermediário na simulação. Na aplicação real, depende da operação de gravação validada abaixo.

## Pesquisa — documentação oficial para o mercado americano

Consulta em 06/11/2026. Não foram usados comparadores, interfaces copiadas ou preços de contratação. Jobber foi incluído por solicitação expressa e atuação norte-americana; não é apresentado aqui como empresa sediada nos EUA.

| Referência | Prática documentada | Adaptação proposta |
|---|---|---|
| [Stripe — credit notes](https://docs.stripe.com/invoicing/dashboard/credit-notes) | Ajustes de faturas finalizadas por crédito. | Retificação auditável; não sobrescrever histórico. Não implementar integração Stripe. |
| [Square US — depósitos](https://squareup.com/help/us/en/article/6581-request-deposits-with-square-invoices) | Depósito e pagamentos parciais separados do total; limitações próprias de relatórios. | Separar contratado, recebido e saldo. Não copiar reconhecimento contábil americano. |
| [QuickBooks US — depósitos](https://quickbooks.intuit.com/learn-support/en-us/help-article/service-items/record-retainer-deposit/L6B5RsY6l_US_en_US) | Registro e aplicação de adiantamentos. | Aplicar recebimento original ao pacote; extra acrescenta somente seu valor. |
| [Jobber — batch invoices](https://help.getjobber.com/en/articles/batch-create-invoices/) | Seleção de trabalhos e agrupamento por cliente em rascunhos. | Seleção por carro/linha; nunca marcar visita concluída só por emitir cobrança. |
| [Housecall Pro — line items](https://help.housecallpro.com/en/articles/7119803-line-items-on-jobs-and-estimates) | Serviços como linhas, favoritos e itens frequentes no mobile. | Reutilizar catálogo existente e acesso direto por veículo. Favoritos só se uso justificar. |
| [ServiceTitan — consolidação](https://help.servicetitan.com/docs/consolidate-multiple-invoices-into-a-single-invoice) | Consolidar documentos do mesmo pagador preservando origens. | Um demonstrativo não gera outra mensalidade; pagador deve ser confirmado. |
| [ServiceTitan — auditoria](https://help.servicetitan.com/v1/docs/understand-accounting-audit-trail) | Histórico de alterações e autoria. | Guardar original, motivo, autor e revisão. |

## Implementações efetivas

Em `v2-documento-misto-previa.js` e CSS:
- Seleção integral por ID do veículo, mantendo seleção individual; nomes iguais não misturam carros.
- Contratado permanece igual ao preço de origem quando pagamento diverge; recebido vem do registro disponível.
- Preço ausente/inválido não significa grátis; rótulo “A confirmar” e compartilhamento bloqueado.
- Exclusão defensiva de competência anterior, cancelamentos e exclusões lógicas quando esses campos estão disponíveis.
- Origens repetidas não são somadas duas vezes e exigem conferência.
- Bloqueio quando `payer_id` explícito diverge do cliente. O carregador legado ainda não fornece esse campo: não representa resolução completa de terceiros.
- Extras encontrados em visitas incluídas exigem conciliação antes de compartilhar.
- Quantidade realizada e restante pelo limite gravado na cobrança; limite ausente não é inventado.
- Exportação revalida permissão, competência e identidade do relatório carregado. Isso é proteção de interface, não substitui autorização do servidor nem detecta alterações remotas sem recarga.
- Ações com mínimo de 44px, foco visível, retorno de foco, resumo anunciado, seleção mista do veículo e documento adaptado a tela estreita.
- Uma área principal de rolagem no painel; botões de compartilhar/imprimir permanecem visíveis.

Em `recibos-demo.html`: cenários separados, adição simulada de polimento/ozônio, duas mensalidades já pagas. Não faz pedidos de rede, não persiste nem confirma pagamentos reais.

## Resultados dos testes

Comando: `node --test tests/v2-recibos*.test.cjs`.
- Os quatro arquivos passam. O runner agrega os três arquivos legados como testes de arquivo e registra 11 casos novos separadamente: 14 entradas aprovadas, zero falhas.
- `preview`: 23 verificações nomeadas; `interface`: 15 verificações nomeadas, incluindo negar acesso, retirar carro inteiro, perder permissão e trocar competência antes de exportar.
- `antecipados`: cenário Ferrari/G63 e isolamento; preservado e aprovado.
- `seguranca`: 11 casos, incluindo preço ausente, origem repetida, pagador diferente, extra após pagamento, outubro preservado no objeto de teste e extra em visita do plano.
- `git diff --check`: sem erros.

Navegador Chromium, dados fictícios:
1. Ferrari/G63/Porsche: exportação bloqueada com Porsche sem preço/pagador divergente. Desmarcar Porsche libera prévia com R$ 1.600,00.
2. Layout com iframe de 390 × 844px: sem transbordamento horizontal no corpo (clientWidth=scrollWidth=375px, descontada barra).
3. Dois pacotes de R$ 250 pagos, polimento R$ 400 e ozônio R$ 100: contratado R$ 1.000; recebido R$ 500; pendente R$ 500. Os valores dos extras são exclusivamente fictícios.
4. Documento mostra cada serviço no respectivo veículo, visita incluída com zero adicional e pagamento independente da execução.

Não testado: Android físico/PWA, compartilhamento nativo Android, PDF final, banco/RLS em execução, concorrência entre dispositivos, gravação de extras, retificação e idempotência no servidor. Testes de UI não comprovam esses itens.

## Contrato para a etapa integrada

Reutilizar tabela de adicionais e catálogo após verificar schema real. Operação transacional recebe IDs de cliente, veículo, competência e serviço, quantidade, preço/desconto autorizados e chave de idempotência. O servidor deve validar papel, propriedade/vínculo financeiro, preço, pacote incluído e duplicidade; cliente não envia total confiável. Não usar o total do atendimento de pacote como outro débito.

Pagamento exige alocação explícita à origem; confirmação repetida não deve gerar outro recebimento. Documento recebe apenas seleção de IDs; servidor relê origens, verifica pagador/competência e gera snapshot com revisão. Alterações posteriores não modificam snapshot anterior; cancelamento/estorno deve produzir evento, sem apagar outubro.

Antes de migração: inspecionar schema e políticas atuais, identificar ambiente isolado ativo, verificar funções de criação/baixa e validar migração reversível com dados fictícios. Nenhuma migração especulativa foi executada.

## Bloqueios e riscos

- Supabase instalado, porém chamada de descoberta retorna exigência de `link_id` sem conexão utilizável disponibilizada. Schema atual e RLS remoto não foram verificados.
- Vercel retorna equipe `vaporeasy`, porém nenhuma lista de projetos acessíveis. Não foi possível comparar esta branch com o deploy atualmente operacional.
- A referência não contém o código da função principal `vaporeasy-v2-staging`; há função de agendamento público e migrations históricas.
- Pagamento parcial/estorno não tem modelo completo comprovado. Divergências são bloqueadas, não reinterpretadas como quitação válida.
- A configuração legada aponta ao banco operacional. Não publicar toda esta branch como homologação de escrita sem isolar configuração.
- Reverter somente os arquivos alterados desfaz este refinamento; não há migração nem dados para reverter.

## Entrega

Código, testes, diagnóstico e proposta ficam na branch isolada. A demonstração publicada é somente visual, privada, com dados fictícios; não é homologação integrada do aplicativo.
