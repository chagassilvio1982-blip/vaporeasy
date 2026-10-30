# Auditoria de segurança — Vaporize Next — 2026-10-30

Projeto consultado: `cfpvexgkjsqpwhebsoos` (homologação isolada).

## Evidências de leitura
- `vaporize_next.organizations`: 1 registro; `memberships`: 1; `clients`: 0.
- Políticas `clients`: SELECT membro, INSERT owner/manager, UPDATE owner/manager, sem DELETE. Manter o bloqueio do teste HTTP de escrita até existir limpeza administrativa segura.
- Supabase Security Advisor: aviso `authenticated_security_definer_function_executable` (20 funções no projeto, incluindo `public.vaporize_next_create_organization`, `public.vaporize_next_my_organizations`, `vaporize_next.can_manage_clients`, `vaporize_next.is_member`). **Aviso não prova exploração**; revisar GRANT EXECUTE e semântica das funções antes de qualquer revogação.
- Supabase Security Advisor: `auth_leaked_password_protection` WARN (proteção contra senhas vazadas não habilitada).

## Próximas verificações
1. Verificar quais papéis efetivamente têm EXECUTE nas funções privilegiadas e se o acesso é indispensável às políticas RLS e fluxos de autenticação. Não revogar automaticamente.
2. Preparar contas de gerente e colaborador via Auth oficial, sem reutilizar contas pessoais nem fabricar registros auth.users via SQL.
3. Validar HTTP/JWT e limpeza administrativa com evidência. Não habilitar DELETE amplo.

Referências:
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Nenhuma alteração de configuração, credencial ou produção foi executada nesta auditoria.
