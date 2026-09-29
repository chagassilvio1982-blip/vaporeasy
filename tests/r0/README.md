# R0 — baseline parcial de comportamento
Data: 2026-09-29. Status: EM ANDAMENTO; não autoriza R1.

## Escopo
Somente V2 Staging: Supabase asuppjeomaymzromgcrp.
Frontend base a340161475c46965d92c7df8dce03d7429288867.
Ponta reconfirmada via GitHub e git ls-remote antes dos testes.
Branch de segurança existente: backup/v2-staging-pre-refatoracao-20260929-a340161.
Nenhum arquivo de runtime, SQL implantado, grant, política ou função foi alterado.
V1 e produção não foram alterados. Não houve correção silenciosa.

## Resultados obtidos
| Caso | Resultado | Evidência |
|---|---|---|
| Agendado para em execução | PASS no banco | scheduled_to_in_progress |
| Conclusão sem foto, justificativa válida | FALHA PREEXISTENTE | P0001: Para concluir o atendimento, registre a foto final do veículo. |
| Atomicidade dessa falha | PASS | status in_progress; zero justificativas persistidas |
| Justificativa curta | Rejeitada conforme regra | mínimo 10 caracteres |
| Conclusão gera pagamento pendente | PASS no banco | pending; R$150 |
| Desconto de 10% após conclusão | FALHA PREEXISTENTE | 42501: Atendimento encerrado não pode ser reaberto ou reescrito. |
| Desconto fixo R$15 após conclusão | FALHA PREEXISTENTE | mesmo 42501 |
| Confirmar sem desconto | PASS no banco | paid; R$150 |
| INSERT/UPDATE em recurring_plans com role authenticated | FALHA PREEXISTENTE do caminho RG | 42501 permission denied for table recurring_plans |
| Cálculo frontend de desconto | 8 casos PASS | node tests/r0/payment-calculation.cjs |
| Sintaxe dos scripts inline | 2 scripts PASS | node --check |
| Tela inicial de staging | Visível | logo, e-mail, senha, Mostrar, botão Entrar único, Sistema pronto |
| Console inicial | Nenhum erro da aplicação capturado nessa observação | Um erro da extensão do navegador, fora da aplicação |

saveVehicleRG faz upsert do diagnóstico antes de tentar modificar recurring_plans. O código usa UPDATE inclusive para desativação e antes de INSERT. Portanto a negativa de UPDATE afeta criação, alteração e desativação nesse caminho. Risco de gravação parcial do RG: inferência do código, não teste E2E concluído.

## Método e limites
completion-payment.sql cria usuário/perfil admin, cliente, veículo, serviço e agendamento sintéticos. Uma exceção interna desfaz integralmente a fixture. Nada foi testado destrutivamente sobre clientes reais.
Para isolar o desconto, a fixture usa metadados sintéticos de foto/Storage somente dentro da transação. Nenhum arquivo de foto foi enviado; isso NÃO certifica captura/upload real.
RPCs de conclusão e pagamento foram chamadas em SQL sob executor administrativo, com auth.uid de usuário sintético admin. Isso caracteriza regras/gatilhos, NÃO certifica transporte REST, sessão nem todas as políticas RLS.
Teste de recorrência troca para role authenticated, verifica barreiras de permissão e volta ao papel original. Não materializa recorrência.
Checagem posterior: zero clientes, serviços, agendamentos e usuários com os marcadores de teste.
Uma tentativa preliminar de fixture de foto foi rejeitada pelo guard de metadados; a transação foi desfeita. O preparo foi ajustado para o formato exigido sem desabilitar gatilhos.
Os erros capturados são anteriores a qualquer refatoração. Não há regressão de implementação a comparar nesta etapa.

## Performance básica
3 downloads HTTP do HTML pelo ambiente de execução: 8894,90; 8613,62; 6547,40 ms. Mediana: 8613,62 ms. HTTP 200; 308881 bytes em cada amostra.
Mede rede + resposta + transferência, não renderização, Android ou tempo de calendário. Três amostras são insuficientes para p95 representativo. Não concluir lentidão do app com essa amostra de rede.

## Pendências obrigatórias para fechar R0
- Login autenticado, digitação/autofill, mostrar/ocultar senha, credencial inválida, sessão expirada, logout/reabertura.
- Android real: autofill, teclado, sessão e PWA; navegador de nuvem não equivale ao dispositivo.
- Testes de UI dos três fluxos, Admin/Operacional, foto real e falhas de upload.
- Recorrência pela agenda e RG: semanal/quinzenal, 5/4/5/4, alteração, cancelamentos, rematerialização e ausência de duplicação.
- Demais casos da matriz do diagnóstico: cadastros, equipes, agenda, financeiro, recibos, público, sincronização.
- Console e métricas autenticadas de login, calendário, busca, horários e recibo.
- Decisão separada sobre correções das falhas preexistentes. R1 NÃO iniciada.

O navegador abriu sem sessão; os testes autenticados dependem de login seguro. Nenhuma senha deve ser enviada no chat.

Atualização: a solicitação segura de credenciais foi submetida. A UI retornou `Invalid login credentials` e permaneceu na tela de acesso. O teste de rejeição de credenciais foi observado; login válido e os fluxos autenticados permanecem bloqueados. Não foi inferida falha do formulário, nem feito reset de senha ou nova tentativa automática.

## Reprodução
Executar payment-calculation.cjs com Node (sem dependências adicionais).
Os arquivos SQL são testes de caracterização, NÃO migrações. Usar apenas execute_sql com project_id asuppjeomaymzromgcrp. Nunca executar em produção.
Antes de repetir completion-payment.sql, verificar novamente os gatilhos e a segurança do rollback. Não retirar o bloco de exceção que desfaz a fixture.
database-results.json conserva as respostas da execução bem-sucedida.
