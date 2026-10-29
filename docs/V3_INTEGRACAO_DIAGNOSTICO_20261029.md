# Integração Vaporeasy V3 — diagnóstico verificado (29/10/2026)

Escopo exclusivo: branch `v3/integracao-supabase-isolada-20261029`; Supabase homologação `cfpvexgkjsqpwhebsoos`. Não alterar V2, BarberGestão nem branch principal.

## Evidências
- `index.html` na origem da branch contém `SUPABASE_URL=https://asuppjeomaymzromgcrp.supabase.co`, e a chave publicável desse projeto. Não aponta para V3.
- `FN` aponta para `/functions/v1/vaporeasy-v2-staging`; `PUBLIC_FN` para `/functions/v1/vaporeasy-public-booking`.
- O Supabase V3 retorna lista vazia de Edge Functions. Portanto a interface existente depende de endpoints indisponíveis na V3.
- O banco V3 possui RPCs `apply_pending_discount`, `confirm_payment_with_discount`, `get_available_slots`, `get_available_slots_public`, `get_available_dates_public`, `create_public_booking_secure`, `create_multi_vehicle_booking` e outras; interfaces e contratos não são equivalentes automaticamente aos endpoints antigos.
- A interface também chama ações `team-access-list`, `team-access-save`, `create-public-link`, `public-dates`, `public-slots`, `public-submit` via Edge Functions.

## Critérios antes de publicar
1. Adaptar todas as ações do frontend aos contratos RPC V3 ou criar Edge Functions V3 com autenticação/autorização corretas.
2. Trocar URL e chave publicável para o projeto V3 **somente após** a compatibilidade estar implementada.
3. Testar login e autorização por perfil, agenda, pagamentos e links públicos com dados fictícios.
4. Implantar somente em preview isolado, validar projeto de destino e nunca promover ao domínio da V2.
5. Confirmar limpeza de dados e equipe fictícia ao fim da homologação.

Status: diagnóstico concluído; implementação e publicação pendentes.