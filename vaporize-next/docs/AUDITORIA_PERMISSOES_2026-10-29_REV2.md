# Auditoria de permissões — Vaporize Next

## Ambiente e método
- Projeto Supabase exclusivo: `cfpvexgkjsqpwhebsoos`.
- Consulta de leitura em `pg_class`, `pg_namespace`, `pg_policy` e `has_table_privilege`.
- Nenhum usuário, tabela, permissão ou dado foi alterado.

## Evidências
| Tabela | RLS | Políticas | SELECT anon | SELECT authenticated | INSERT/UPDATE/DELETE authenticated |
| --- | --- | ---: | --- | --- | --- |
| clients | true | 1 | false | true | false |
| memberships | true | 1 | false | true | false |
| organizations | true | 1 | false | true | false |
| vehicles | true | 1 | false | true | false |

## Interpretação e limites
- Usuários anônimos não possuem privilégio SELECT nessas tabelas.
- Usuários autenticados possuem privilégio SELECT, condicionado às políticas RLS.
- Usuários autenticados não possuem privilégios diretos de INSERT, UPDATE e DELETE.
- **Não houve teste A/B com JWTs distintos.** A auditoria de catálogo não comprova, sozinha, a separação entre duas empresas.
- **Não houve execução confirmada do GitHub Actions.** A publicação Vercel READY não equivale a testes aprovados.
- A criação segura de identidades sintéticas e a execução dos cenários de RLS permanecem pendentes.
