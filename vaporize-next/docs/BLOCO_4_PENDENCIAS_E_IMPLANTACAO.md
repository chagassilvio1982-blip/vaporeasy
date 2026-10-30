# Bloco 4 — implantação segura em homologação

Projeto Supabase autorizado: `cfpvexgkjsqpwhebsoos`. Branch isolada: `vaporize-next/isolado-20261029`.

## Situação
- Simulador de horários publicado na Preview; teste autenticado ainda pendente.
- Camada `src/data/appointments-write.js` implementada, mas não integrada ao formulário.
- Migrações preparadas, **não confirmadas como aplicadas**:
  1. `migrations/20261030_appointments_owner_manager.sql`
  2. `migrations/20261030_appointments_overlap.sql`
- As chamadas ao conector Supabase foram bloqueadas por política de segurança. Não tentar contornar o bloqueio.

## Ordem de homologação
1. Inspecionar estado atual das policies e constraints no projeto isolado, sem modificar produção.
2. Revisar e aplicar migrações de forma idempotente (os arquivos atuais usam CREATE POLICY/ADD CONSTRAINT sem IF NOT EXISTS); verificar se extensão btree_gist está disponível, se há conflitos existentes e se RLS está habilitado.
3. Testar isolamento por organização e permissões com sessões reais de owner, manager e collaborator.
4. Integrar formulário de cadastro, com seleção de veículo, prevenção de conflitos e feedback de erros; não prometer atomicidade baseada só em consulta prévia.
5. Implementar e testar edição, cancelamento e recorrência com rollback/limpeza dos dados fictícios.
6. Executar npm test e teste autenticado da Preview. Registrar URL, commit e evidências.

## Atenção técnica
- `buildRecurringOccurrences` atualmente soma dias em UTC; conferir preservação do horário local quando houver mudança de fuso/DST.
- A interface usa `datetime-local` e `new Date(localStart)`; em navegadores fora de São Paulo o horário será interpretado no fuso do dispositivo. Corrigir antes de disponibilizar gravação.
- Não aplicar SQL manualmente em V2/V3, não conceder DELETE amplo, não usar credenciais na conversa.
