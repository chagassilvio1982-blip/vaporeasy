# Teste RLS ampliado — empresas, vínculos, clientes e veículos

Data: 29/10/2026.

## Ambiente
Supabase isolado Vaporize Next `cfpvexgkjsqpwhebsoos`. Operações dentro de `BEGIN` / `ROLLBACK`.

## Preparação
Duas organizações sintéticas, dois clientes, dois veículos e um vínculo `owner` para usuário já existente somente na empresa A. `request.jwt.claim.sub` definido antes de `SET LOCAL ROLE authenticated`.

## Resultados observados
| Tabela | Registros na transação | Registros visíveis como usuário da A |
|---|---:|---:|
| organizations | 2 | 1 |
| memberships | 1 | 1 |
| clients | 2 | 1 |
| vehicles | 2 | 1 |

## Limpeza verificada
Após `ROLLBACK`, consulta separada retornou `organizations=0`, `memberships=0`, `clients=0`, `vehicles=0`.

## Limites
Simulação de identidade via contexto SQL, não JWT emitido pelo serviço Auth. Teste end-to-end com dois usuários autenticados e recuperação de senha no navegador permanecem pendentes. Nenhuma operação na V2 ou produção.
