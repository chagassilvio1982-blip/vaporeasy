# Teste real da chave estrangeira multiempresa

Data: 29/10/2026. Projeto Supabase isolado: `cfpvexgkjsqpwhebsoos`.

## Evidência
Consulta ao catálogo `pg_constraint` confirmou:

```sql
FOREIGN KEY (client_id, organization_id)
REFERENCES vaporize_next.clients(id, organization_id)
ON DELETE RESTRICT
```

Em transação `BEGIN` / `ROLLBACK`, foram criadas duas empresas temporárias A e B e um cliente da A. Uma tentativa de inserir veículo com `organization_id` da B e `client_id` da A foi capturada por `foreign_key_violation`. O bloco SQL exigiu a rejeição, caso contrário produziria exceção.

Resultado observado: `cross_organization_link = rejected`; `vehicles_created = 0`.

Consulta independente após rollback: `organizations = 0`, `clients = 0`, `vehicles = 0`.

## Escopo
Teste real do PostgreSQL com identidade administrativa da ferramenta, não teste de JWT nem de API HTTP. Nenhuma alteração na V2 ou produção.
