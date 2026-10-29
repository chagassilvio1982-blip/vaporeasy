# Execução isolada do controlador — 29/10/2026

## Fonte
Arquivo exato `vaporize-next/src/auth/controller.js`, recuperado do GitHub na branch `vaporize-next/isolado-20261029`, blob SHA `19a1616b475eca4c81c00350d49b108e617bf0bc`.

## Método
O código-fonte foi carregado e executado em ambiente JavaScript V8 isolado, removendo apenas a palavra-chave `export` para permitir instanciação da função. Os métodos Supabase foram simulados; não houve chamadas reais ao banco ou autenticação.

## Resultados
| Cenário | Resultado |
|---|---|
| Usuário sem vínculo empresarial | PASS |
| Usuário com vínculo retornado pela RPC simulada | PASS |
| RPC com erro | PASS |
| `auth.getUser` lança exceção | PASS |
| Logout durante RPC pendente | PASS |
| Troca de senha sem sessão de recuperação | PASS |

**Total: 6 PASS / 0 FAIL.**

## Limites
- Não é execução do comando `npm test` nem do GitHub Actions.
- Não é teste com JWT real, navegador ou Supabase.
- Não cobre o conjunto integral de testes de interface, recuperação PKCE ou isolamento A/B.
- Nenhum dado de produção, V2 ou banco Next foi alterado.

## Próximas ações
Executar a suíte Node completa em ambiente isolado e validar A/B com identidades sintéticas.