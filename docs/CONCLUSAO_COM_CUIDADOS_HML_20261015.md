# Conclusão com conferência de cuidados — somente homologação

## Motivação
O print do BMW M4 demonstrou quatro contadores, aviso repetido e cuidados previstos sem confirmação real na finalização. O objetivo é oferecer uma conferência objetiva e auditar tanto o que foi realizado quanto o que não foi.

## Mudanças
- No modal de conclusão, três contadores: contratadas, concluídas e a realizar. A quantidade de agendadas permanece na gestão da agenda, fora da tela de concluir.
- Removido o texto repetido “Visitas nesta competência: ...” abaixo da ficha.
- A ficha de conclusão mostra cuidados previamente registrados, observações e histórico. Os cuidados pendentes aparecem em **CONFIRMAR EXECUÇÃO**, cada um com “Realizado” e “Não realizado”, sem pré-seleção.
- O botão aguarda o carregamento da RPC de cuidados; falhas bloqueiam conclusão para evitar baixa silenciosa.
- A conclusão usa `complete_appointment_with_cares`: mudança de status e registros de cuidados na **mesma transação**. Resposta “Não realizado” cria auditoria em `package_visit_care_checks`, sem evento de aplicação nem cobrança. “Realizado” gera um evento em `package_service_events` vinculado à estética, evitando repetir um evento já registrado nesse atendimento.
- A classificação contratual e os gatilhos financeiros existentes permanecem os responsáveis pelo financeiro. Sem alterações em preços, mensalidades ou histórico anterior.
- Proprietário, administrador e operador atribuído têm validação no banco; o operador não tem acesso a telas financeiras.

## Testes (homologação isolada `wwivmyhlwqyzmaexkmnk`)
- Teste SQL com sessão simulada de proprietário: 1 cuidado realizado + 1 não realizado, status concluído e zero cobranças ou pagamentos individuais adicionais. **ROLLBACK confirmado**, atendimento continua `in_progress`.
- Teste SQL com sessão simulada de operador atribuído e data ajustada somente dentro da transação: não realizado é auditado, sem evento de aplicação. **ROLLBACK confirmado**.
- Tentativa de registrar benefício não contratado e operador não atribuído bloqueadas; nenhuma conclusão parcial persistida. **ROLLBACK confirmado**.
- Suite Node + sintaxe GitHub Actions: acompanhar resultado na PR 14.
- **Pendente**: teste autenticado navegador/Android e checagem de acessibilidade; não aprovar publicação em produção sem execução.

## Segurança / rollback
O script `tests/plan-care/rollback-hml-completion-care-20261015.sql` remove a estrutura apenas se a tabela de conferências estiver vazia. Não executar após testes de usuário sem exportação e revisão dos registros. Sem merge da branch para `main`; PR 14 permanece draft.

**Nota sobre histórico:** aplicações de hidrorrepelente e grafeno lançadas separadamente em 14/10 não devem ser tratadas como estética concluída. A nova conferência não altera nem apaga esses registros históricos.
