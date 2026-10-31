# Vaporize Next — validações isoladas — 2026-10-30

Ambiente: Supabase `cfpvexgkjsqpwhebsoos`; branch `vaporize-next/isolado-20261029`. Produção e V2 preservadas.

## 1. RLS e perfis — inspeção de banco concluída
Consulta de `pg_class` confirmou `relrowsecurity=true` nas cinco tabelas: appointments, clients, vehicles, organizations e memberships.
Consulta de `pg_policies` confirmou:
- appointments, clients e vehicles: SELECT para membros; INSERT/UPDATE para proprietário ou gerente via `can_manage_clients(organization_id)`;
- organizations e memberships: SELECT para membros;
- nenhuma política DELETE nessas tabelas.
**Limite da evidência:** inspeção de definição não é execução HTTP com JWT real de gerente/colaborador. Falta comprovar essas duas sessões.

## 2. Agenda — regras verificadas no banco, testes de escrita pendentes
`appointments` possui:
- exclusão GiST `next_appointments_no_vehicle_overlap` para impedir sobreposição de veículo dentro da organização, exceto cancelados;
- CHECK `next_appointments_slot_0730_20min` para horários a partir de 07h30 e incrementos de 20 minutos no fuso de São Paulo;
- CHECK `next_appointment_valid_interval` para término posterior ao início;
- FK composta `next_appointment_vehicle_same_org` para impedir veículo de outra organização.
No código, `scheduling/rules.js` valida horários e recorrência semanal (7 dias) e quinzenal (14 dias), com até 52 ocorrências. Os testes unitários anteriores permanecem registrados; não foram repetidos aqui.
**Pendente:** executar CRUD HTTP/JWT real de owner e manager, negar collaborator e verificar rollback/limpeza de fixture.

## 3. Offline — projeto técnico; não declarar implementado
Requisitos mínimos antes de implementar:
1. Cache de shell PWA e assets versionados com Service Worker; não cachear respostas privadas de autenticação.
2. IndexedDB para fila local de mutações, com UUID de operação, organização, tipo, versão e status. Dados pessoais mínimos; considerar proteção de dados em repouso.
3. Captura offline de agenda e fotos com indicação explícita de pendência e reenvio ao reconectar; não prometer conclusão antes da confirmação do servidor.
4. Política de conflitos: o banco é autoridade; horários podem ser recusados ao sincronizar. Nunca substituir silenciosamente registro mais novo.
5. Isolamento por usuário/organização e limpeza de cache privado no logout; não persistir JWT em fila de operações.
6. Testes em modo avião, reinício do aplicativo, duplicidade/retry, troca de usuário, expiração de sessão e conflito simultâneo.
**Estado:** especificação registrada; funcionalidade offline ainda não implementada nem validada.

## 4. Evidências e pendências
- HTTP/JWT proprietário: `GET /auth/v1/user` 200; `GET /rest/v1/appointments?select=id&limit=0` 200, comprovados em captura do navegador do proprietário.
- O teste de escrita foi implementado em `src/ui/appointment-write-probe.js` e vinculado em `main.js` e `index.html`. O botão cria, edita e cancela um agendamento fictício de veículo conhecido, preservando registro cancelado para auditoria.
- **Nenhuma execução real do teste de escrita confirmada**.
- A Vercel retornou status de commit `failure` com URL de `build-rate-limit` para o commit `fb56f534`; não há evidência de Preview READY contendo esse commit.

## 5. Plano de publicação única
1. Evitar novos commits na branch enquanto o limite de build estiver ativo, salvo correção crítica.
2. Confirmar que a versão final contém `verify-appointment-writes` e o import correspondente.
3. Quando liberado o limite, publicar **uma** Preview, confirmar commit exato e estado READY.
4. Executar o botão autenticado em homologação; registrar resultados, confirmar estado final `cancelled` e ausência de agendamentos de teste ativos.
5. Repetir com sessão real do gerente e verificar que o colaborador não consegue executar operações de escrita.
6. Documentar evidências antes de encerrar o Bloco 4.

## Critério de conclusão
Bloco 4 **não concluído** enquanto operações reais de escrita e permissões por JWT não forem verificadas. Nenhum resultado de produção pode ser inferido dos testes de homologação.


## Atualização de execução — bloqueio comprovado
- GitHub commit `776382e2301e54459f38945d860b12b57bc8889`: status Vercel `failure` por `build-rate-limit`.
- Tentativa de deploy direto via API Vercel, usando `gitSource` da branch isolada e sem target de produção: HTTP **402**, código `api-deployments-free-per-day`, mensagem `Resource is limited - try again in 24 hours (more than 100)`, `retryAfter=86400`. Nenhum deploy novo foi confirmado.
- Consulta SQL somente leitura na homologação: `appointments=0`, `scheduled=0`, veículo de teste encontrado `1`, vínculos dos três perfis encontrados `3`.
- Operações HTTP/JWT reais de escrita e bloqueio do colaborador **não executadas**. Não aprovar Bloco 4 sem essas evidências.
- Próxima tentativa de deploy somente após liberação do limite; preservar a branch e evitar novas publicações até então.

## Atualização: Preview publicada
- Vercel deployment ID: `dpl_7s9kqRNcasqsS95LkqawvQbPFriK`.
- Preview: `https://vaporeasy-62srrop2u-vaporeasy.vercel.app/vaporize-next/`.
- Vercel confirmou `READY`, commit `d181a1a831a96c0cfbba9d5dd557f901720379b6`, branch isolada, target Preview.
- `main.js` importa e inicializa `attachAppointmentWriteProbe`; `index.html` contém botão `verify-appointment-writes` e campo de status.
- Teste HTTP/JWT real de escrita pendente: perfis de navegador disponíveis sem login confirmado na Preview. Não simular sessão ou solicitar credenciais na conversa.
- Aceite: owner e manager criam/editam/cancelam; collaborator sem permissão de escrita; conferir registro final cancelado e ausência de registros de teste ativos; registrar evidências.

## Evidência real do proprietário — 2026-10-30
- Captura da interface autenticada fornecida pelo proprietário: `Criar: OK | Editar: OK | Cancelar: OK`.
- Consulta SQL em `vaporize_next.appointments` agrupada por status confirmou exatamente 1 registro `cancelled`, nenhum outro status. Não foi necessária nova execução de teste.
- Resultado: fluxo de escrita do proprietário validado pela interface e estado final confirmado no banco; auditoria do registro cancelado preservada.
- Perfis TinyFish de gerente e colaborador ainda sem sessão autenticada confirmada. Não declarar seus testes concluídos até execução real.
