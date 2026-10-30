# Protocolo seguro de teste HTTP INSERT e limpeza — Vaporize Next

**Ambiente único:** Supabase `cfpvexgkjsqpwhebsoos` (homologação). Nunca usar em V2 ou produção.

## Estado comprovado
- RLS `clients`: políticas SELECT e INSERT; **não existe DELETE**.
- Privilégio SQL DELETE para `authenticated` não supera RLS.
- Contagens verificadas em 29/10/2026: zero organizações, zero memberships e zero clients.
- Verificador HTTP `check-rest-insert-rls.mjs` permanece bloqueado por segurança. A variável de confirmação, sozinha, **não comprova** que a limpeza funciona.

## Plano de execução
1. Criar três usuários Auth **sintéticos distintos**, sem utilizar contas pessoais; criar duas organizações sintéticas A/B e memberships: owner(A), manager(A), collaborator(A). Não compartilhar senhas/JWT.
2. Usar sessões JWT reais e verificar `/auth/v1/user` para cada uma. Fazer `POST /rest/v1/clients` com `Content-Profile: vaporize_next` e `Prefer: return=representation`.
3. Esperar HTTP 201 para owner e manager na A; esperar falha 4xx para collaborator na A e owner na B. Se qualquer negativa gerar registro, marcar falha.
4. Guardar **somente IDs dos registros sintéticos criados** (sem tokens). Realizar limpeza administrativa via conexão de banco homologação, em transação, por IDs explícitos, organização A/B e prefixo exclusivo `vnext-http-rls-`; verificar contagem 0 após commit.
5. Só então remover memberships/organizações sintéticas por IDs explícitos e verificar contagens. Não alterar RLS ou conceder DELETE a usuários.

## Critérios para limpeza SQL administrativa

Não executar limpeza por prefixo sozinho. Exigir simultaneamente: IDs retornados pelo POST, IDs de organizações sintéticas e nome com prefixo exclusivo. Antes de DELETE, verificar que o conjunto corresponde exatamente aos IDs esperados; abortar se houver divergência. Limitar a no máximo 4 clientes por execução. Nunca usar `service_role` no browser, repositório ou logs.

**Pendente:** credenciais JWT sintéticas e organizações temporárias. Ainda não há evidência de POST HTTP autenticado. Sem esses pré-requisitos, o script deve falhar fechado.

## Revisão do script

O script atual tenta `DELETE` por HTTP com JWT owner. Esse mecanismo **não funciona** enquanto não houver política DELETE. Portanto, não habilitar a execução com `VAPORIZE_NEXT_APPROVED_CLEANUP=verified` até substituir a limpeza por um mecanismo administrativo verificado. 
