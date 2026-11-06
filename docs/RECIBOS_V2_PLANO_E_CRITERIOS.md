# Vaporeasy V2 — Central de Recibos e Documento Consolidado

Status: especificação técnica da etapa seguinte. **Não implementada nesta branch**.
Base inspecionada: `fix/v2-atualizacao-segura-20261102`.
Responsável pela aprovação de regras financeiras: proprietário da Vaporeasy.

## Problema observado

Um cliente com três veículos (dois com mensalidades/pacotes e um serviço avulso) exige dois documentos porque a V2 usa fluxos distintos de mensalidade de pacote, cobrança avulsa e recibos financeiros. O acesso à emissão fica escondido entre Agenda/Financeiro e a seleção de agrupamento não oferece controle por modalidade e serviço para cada veículo.

## Etapa 1 — Navegação (implementada apenas na branch)

- Acesso `Recibos` na Agenda e no Resumo, sem trocar a lógica financeira.
- Campo de pesquisa de clientes na lista agrupada por mês do Financeiro, com suporte a acentos.
- Respeito aos perfis com acesso financeiro: colaborador e operador não podem abrir essa central.
- Nenhuma escrita ou ajuste de valores/lançamentos/assinaturas/recibos pelo novo atalho.

## Etapa 2 — Documento único (implementação futura)

### Fluxo de usuário

1. Abrir `Recibos` e buscar o cliente.
2. Selecionar mês ou intervalo customizado. Ver os veículos cadastrados, os serviços concluídos e as mensalidades.
3. Selecionar os lançamentos individualmente (checkbox), agrupados por veículo e modalidade: **Pacote, Avulso, Extra**. Mostrar nome real do serviço prestado, data, quantidade, cobrança e status de pagamento.
4. Para cada linha, permitir corrigir **a vinculação do serviço** ao veículo/atendimento, respeitando trilha de auditoria e sem modificar lançamento pago por engano.
5. Mostrar prévia consolidada com detalhamento por veículo, descontos já registrados, valores pagos antes, saldo devido e total do documento.
6. Emissão de PDF e compartilhamento pelo WhatsApp com um toque. Manter histórico e permitir reenviar sem criar um novo lançamento.

### Fontes financeiras e integridade

- Serviço concluído avulso deve ser ligado ao seu agendamento/serviço e pagamento registrado.
- Mensalidade de pacote deve ser ligada à competência, ao veículo, ao pacote e ao lançamento de cobrança original. Visitas incluídas no pacote **não criam nova cobrança** no recibo.
- Não somar duas vezes a mesma competência/pagamento em agrupamentos.
- O identificador da linha deve ser determinístico por **tipo de origem + ID de origem**, não pelo nome/placa.
- Permitir um veículo com vários serviços e o mesmo cliente com modalidades diferentes.
- Não alterar o status `pago` só para emitir o documento.
- Para status misto (pagos e pendentes), utilizar **demonstrativo consolidado de serviços e pagamentos**, com seção separada `Recebido` e `A receber`. O título `Recibo de pagamento` só deve afirmar os valores de fato recebidos.
- Preservar a competência original, histórico de descontos, método e data de recebimento; nunca inferir data/valor de pagamento a partir de agendamento.
- Criar snapshot imutável da emissão e versão de retificação, com `created_by`, `issued_at`, identificador, status e vínculos.
- Aplicar autorização no servidor (proprietário/gerente com permissão financeira). Isolamento por cliente e pelas entidades da empresa; RLS para tabelas expostas.
- Não executar correção automática de valores antigos; alterações exigem ação explícita e log auditável.

### Exemplo de aceitação: cliente com três carros

| Linha | Modalidade | Situação | Exibição no documento | Impacto no saldo |
|---|---|---|---|---|
| Veículo A | Pacote | mensalidade quitada | serviço(s) do pacote + `Pago na mensalidade` | zero a cobrar |
| Veículo B | Pacote | mensalidade quitada | serviço(s) do pacote + `Pago na mensalidade` | zero a cobrar |
| Veículo C | Avulso | pagamento pendente | nome do serviço + valor pendente | inclui no saldo a receber |

**Resultado:** um único demonstrativo compartilhável, discriminando os três carros; quando o avulso for pago, a versão de recibo não deverá declarar o valor de pacote novamente recebido no dia.

### Matriz mínima de testes

- Cliente 3 carros: 2 pacotes quitados + 1 avulso pendente; um documento, sem cobrar pacotes novamente.
- Pacote pendente + avulso pago: soma correta e status separados.
- Desconto personalizado por veículo: preserva valor original, desconto e líquido.
- Mesmo cliente com atendimentos em dias distintos do mês: seleção por período, sem limite ao mesmo dia.
- Serviços de clientes diferentes: rejeitar agrupamento.
- Seleção duplicada e múltiplos cliques: emissão idempotente, sem duplicação.
- Competência paga parcialmente e upgrades: crédito aplicado uma vez.
- Documentos antigos emitidos: imutáveis; retificação gera nova versão.
- Login colaborador: sem acesso a dados financeiros.
- Reabertura e compartilhamento: mesmo snapshot, mesmos valores.

## Etapa 3 — Refinamento visual (homologação)

- Navegação principal organizada por Agenda, Recibos, Clientes e Financeiro.
- Busca global por cliente/placa nas telas permitidas.
- Menos botões escondidos em menus; ações principais visíveis em telas de celular.
- Calendário mantém as vistas por Mês/Dia/Lista, com destaque operacional para status.
- Economia de água permanece acessível, mas não ocupa o primeiro espaço de ação.
- Rotulagem consistente: `Cobrança`, `Demonstrativo`, `Comprovante de serviço`, `Recibo pago`.

## Critério de publicação

1. Comparar a branch de implementação com o commit realmente ativo na V2 publicada.
2. Validar visualmente em Android e desktop no ambiente isolado.
3. Validar os cenários financeiros com registros de teste; verificar que históricos e lançamentos reais não mudam.
4. Liberar para produção somente após aprovação explícita e checklist de regressão.
