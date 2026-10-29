# Vaporeasy V3 — auditoria de autorização das Edge Functions (27/10/2026)

## Escopo e evidências
Ambiente exclusivamente de homologação: `asuppjeomaymzromgcrp`.
Código implantado consultado diretamente no Supabase: `vaporeasy-v2-staging` v11 e `vaporeasy-public-booking` v1. Nenhuma requisição de escrita ou mudança em produção foi realizada.

## Controles observados
- `vaporeasy-v2-staging`: `requireActiveUser` extrai Bearer token, valida via `auth.getUser` e exige `app_profiles.active`; `requireManager` exige `owner` ou `admin` nas operações de gestão de acesso.
- `bootstrap`: autentica o usuário; se ainda não existe perfil, permite criar o primeiro `owner` somente quando a contagem de perfis é zero. Revisar política de provisionamento antes de qualquer uso multiempresa.
- `vaporeasy-public-booking`: `public-submit` exige token correspondente a `public_booking_links` ativo e não revogado. É intencionalmente público; não deve ser descrito como protegido por sessão.
- Ambas as funções usam `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do ambiente. A chave administrativa contorna RLS; as validações de função são uma fronteira de segurança.
- RLS das tabelas `appointments`, `clients`, `vehicles` e `appointment_payments` foi consultada; as escritas autenticadas exigem papel `owner`/`admin`.

## Limitações
Não foram lidos os valores efetivos dos segredos (e não devem ser expostos). Não há prova definitiva de isolamento de dados por comparação com V2. Nenhum teste HTTP negativo foi comprovado nesta auditoria; não registrar como aprovado. Não foi realizado teste de escrita.

## Critérios para liberação de gravação
1. Confirmar por mecanismo seguro que a URL de ambiente efetiva das duas funções corresponde a `https://asuppjeomaymzromgcrp.supabase.co`, sem divulgar a service role key.
2. Validar respostas 401/403 para chamadas administrativas sem sessão e 404 para token público inválido, sem gerar agendamentos.
3. Executar gravação descartável somente em homologação e verificar ausência de efeito na V2, com plano de limpeza.
4. Manter a branch V3 em preview; não publicar na produção antes de aceite.

## Registro de alterações
Somente este documento de auditoria foi adicionado à branch de homologação. Nenhuma função, banco, segredo ou implantação foi alterado.
