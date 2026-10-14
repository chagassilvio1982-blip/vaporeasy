# Vaporeasy V2 — resultados de homologação, 14/10/2026

**Escopo:** somente Supabase `wwivmyhlwqyzmaexkmnk` e branch `feature/v2-enxuta-planos-relatorio-20261014`. Produção não alterada.

## Testes executados e resultados
| Cenário | Resultado | Evidência |
| --- | --- | --- |
| Supabase isolado, RPCs e requisitos de acesso | APROVADO | RLS ativa; `appointment_care_brief` executável por authenticated, não por anon |
| Benefícios de exemplo para Toyota Corolla Cross HML2605 — cliente TESTE | APROVADO | 2 benefícios previstos (hidrorrepelente e enceramento), 1 hidrorrepelente realizado em 14/10 |
| Leitura real por proprietário com JWT autenticado | APROVADO | `get_client_plan_control` retornou 1 plano, 2 benefícios previstos e 1 execução |
| Diferenciação plano vs atendimento avulso/recorrência sem plano | APROVADO | `appointment_care_brief` retornou true para vínculo contratual e false para atendimento sem plano |
| Restrição operacional | APROVADO | Colaborador só lê atendimento atribuído para o dia; atendimento futuro não atribuído => false |
| Financeiro oculto de colaborador | APROVADO | RPC de resumo da visita em nome de operador retornou plano, mas não devolveu `monthly_amount` |
| Plano: iniciar e concluir como operador, sem foto, sem duplicar cobrança | APROVADO | `operator_start_job`, `operator_complete_job`; status `completed`, carimbo temporal gerado, pagamentos 0→0, mensalidades 1→1 |
| Visita sem plano: iniciar e concluir como operador, sem foto | APROVADO | Teste transacional com novo agendamento de R$150; 1 lançamento individual de R$150 na conclusão |
| Integridade dos testes | APROVADO | Transações `BEGIN/ROLLBACK`: 0 agendamentos temporários remanescentes, 1 visita teste permanece agendada |
| Foto obrigatória | APROVADO NA HOMOLOGAÇÃO | Gatilho removido apenas em banco isolado; backup dos originais em `tests/v2-enxuta/rollback_photo_requirement_20261014.sql` |
| Resumo por veículo na interface (JS real + mock DOM e consultas) | APROVADO NO MOCK | Renderizou `Plano Premium`, realizado em 14/10, pendente, últimas datas e observação HTML escapada |
| Vercel | COMPILADO | Status `success` do commit `41c9714` no GitHub; https://vercel.com/vaporeasy/vaporeasy/8RtvEKZU95T9jtdLvtH6Hr6KL4fY |
| Navegador real autenticado, Android e rede instável | **PENDENTE** | Não houve sessão de navegador móvel autenticado controlável por esta execução |
| Conferência da lista real de benefícios contratados por plano | **PENDENTE** | Os dois benefícios do Corolla são exemplos de homologação, **não** cadastro comercial definitivo |
| Publicação em produção | **NÃO REALIZADA** | Exige aprovação e checklist final |

## Mudanças na base de homologação
- Aplicada a migration `20261013_remove_mandatory_completion_photo.sql` para tirar exigência de fotografia. Existe arquivo de reversão com definições anteriores e gatilho.
- Inseridos dois benefícios **exclusivamente** no registro `TESTE — Plano Vaporeasy / Toyota Corolla Cross / HML2605`; não houve mudança em contratos reais.
- As demais operações de início/conclusão e lançamentos foram realizadas dentro de transações revertidas. Nenhum agendamento ou cobrança temporária foi mantido.

## Próximos passos
1. No Android, abrir a prévia de homologação com o login de teste; localizar `TESTE — Plano Vaporeasy` e conferir visual imediato ao entrar no cliente.
2. Conferir em `Meus atendimentos` com perfil de colaborador, sem informações de cobrança.
3. Testar com rede lenta e registrar qualquer erro de carregamento, sem presumir suporte offline.
4. Conferir lista comercial de benefícios e normas de cobrança, então aprovar eventual publicação em produção.

**Observação:** o status de Vercel não comprova os testes E2E no celular.
