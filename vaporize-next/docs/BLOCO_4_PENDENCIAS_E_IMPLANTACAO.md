# Bloco 4 — estado verificado em 2026-10-30

Ambiente: Supabase isolado `cfpvexgkjsqpwhebsoos`; branch `vaporize-next/isolado-20261029`. Não alterar V2, V3, produção ou domínios oficiais.

## Confirmado no banco
- Políticas RLS de leitura por membro e escrita de agendamentos por owner/manager; collaborator não pode inserir (erro 42501 em teste de role authenticated).
- Corrigida ausência de GRANT SELECT/INSERT/UPDATE à role authenticated em appointments. Migração aplicada `vaporize_next_appointments_authenticated_grants_20261030`; código em `migrations/20261030_appointments_authenticated_grants.sql`.
- INSERT como manager authenticated funcionou em transação revertida; contagem de agendamentos de teste permanece zero.
- Constraint de horários a partir das 07h30, grade de 20 minutos em America/Sao_Paulo, aplicada e testada com horário inválido.
- Exclusion constraint de conflito por organização+veículo, integridade de vínculo entre organização e veículo e intervalo válido aplicadas. Testes SQL transacionais anteriores confirmaram conflito e isolamento.
- Três perfis (owner, manager, collaborator) cadastrados e com memberships ativos.

## Código
- Formulário da agenda integrado a create/update/cancel e recorrência com inserção única atômica, na branch isolada.
- Regras: 07h30, 20 minutos, duração padrão 90 minutos, recorrência semanal/quinzenal, fuso São Paulo.
- Teste de recorrência corrigido para UUID real do veículo em commit `a4c1ed1`.

## Pendências de liberação — não declarar conclusão antes da evidência
1. Executar a suíte completa `npm test` em runtime Node 22 e registrar saída. Workflow GitHub Actions existe, mas nenhuma execução associada foi confirmada.
2. Publicar a versão mais recente da branch em **Preview** e validar a URL exata. Última Preview READY verificada: commit `b74d3dd`, URL `https://vaporeasy-2rrihvhg6-vaporeasy.vercel.app/vaporize-next/`; ela NÃO contém as correções posteriores. O limite gratuito de builds da Vercel bloqueou publicações mais recentes.
3. Testar fluxos HTTP/PostgREST com JWT de sessões reais owner/manager/collaborator e navegação E2E da Preview atualizada; não coletar senhas/tokens no chat.
4. Verificar funcionalidade no dispositivo e estados de erro, incluindo conflito, edição, cancelamento e recorrência.

## Regra de continuidade
Continuar automaticamente; só solicitar intervenção do usuário para autenticação estritamente necessária. Nunca publicar produção nem declarar homologação concluída sem os testes finais.
