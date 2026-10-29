# Auditoria RLS — Vaporize Next — 2026-10-29

Projeto Supabase exclusivo: `cfpvexgkjsqpwhebsoos`.

## Confirmado via consulta autenticada ao catálogo PostgreSQL
- Schema `vaporize_next`: proprietário `postgres`, `authenticated` com USAGE, `anon` sem USAGE.
- Função `vaporize_next.is_member(uuid)`: `SECURITY DEFINER`, proprietário `postgres`, `search_path` vazio.
- Tabelas `organizations`, `memberships`, `clients`, `vehicles`: RLS habilitado, exatamente uma política de leitura por tabela (`next_org_read`, `next_membership_read`, `next_clients_read`, `next_vehicles_read`).
- Em todas as quatro tabelas: `anon` sem SELECT; `authenticated` com SELECT, mas sem INSERT, UPDATE ou DELETE.

## Não testado
- Isolamento real entre duas organizações com sessões autenticadas A e B.
- Disponibilidade do schema customizado na Data API Supabase.
- Recuperação de senha e login reais.
- Execução automatizada dos testes Node.
- Autorização de entrada em módulos (bloqueada até verificação de vínculo ativo).

## Restrição
Não criar usuários, alterar permissões ou expor dados V2. Não considerar o schema homologado para produção até testes A/B.
