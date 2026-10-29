# Teste A/B de isolamento — pré-condições

Projeto isolado: `cfpvexgkjsqpwhebsoos`.

## Situação verificada
- A função `public.vaporize_next_my_organizations()` filtra pelo `auth.uid()`, por vínculos ativos e por organizações ativas.
- As tabelas de empresas e vínculos têm restrições de status, função, unicidade e chaves estrangeiras.
- Há **1 registro em auth.users** no ambiente isolado. Identidade e propriedade não foram investigadas, e não será modificada.
- As quatro tabelas operacionais iniciais estão vazias.

## Execução segura pendente
1. Provisionar duas identidades sintéticas próprias do ambiente Next, sem reutilizar a conta existente e sem expor senhas ou tokens.
2. Criar duas organizações fictícias e vincular cada identidade apenas à sua organização.
3. Consultar RPC com JWT de A e de B separadamente; A não deve ver B, e B não deve ver A.
4. Desativar vínculo/organização em transação controlada e verificar bloqueio; restaurar apenas registros sintéticos.
5. Validar RLS para clientes e veículos, incluindo rejeição de associação entre empresas.
6. Apagar dados sintéticos após o teste, preservando a conta preexistente.

**Nenhuma dessas etapas A/B foi executada neste documento.** Não usar usuários reais, a V2 ou a produção.
