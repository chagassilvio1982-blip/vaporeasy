# Client plan usage and included-service history

Owner/admin access from Clients > selected client > Controle dos planos.
Counts completed plan appointments by vehicle and service date in America/Sao_Paulo. Scheduled appointments are separate; cancelled appointments do not consume visits. The monthly charge snapshot supplies the historical quota; current contract is a clearly labelled fallback for this month only. Unknown historical quotas are not invented.
Included benefits have execution date, label, optional completed-appointment link, notes and immutable creator audit. Registration has retry idempotency; annulment preserves audit. No charge, payment or additional appointment is created by a benefit entry.

Validated 2026-10-09 on isolated Supabase wwivmyhlwqyzmaexkmnk:
- database.sql: eight groups PASS, rolled back all fixtures; includes completion transitions, two vehicles, monthly quota changes, local month boundary, finance/count isolation, validation, retry, void and permissions.
- node --check plan-control.js PASS.
- node tests/plan-control/dom.cjs PASS (jsdom mocked RPC): rendering, escaping, month selection, dated benefit, failed-request retry, write locking, annulment, empty month and operator guard.
- Real authenticated browser end-to-end not performed.

This branch is HOMOLOGATION ONLY. index.html explicitly uses isolated staging Supabase and a test-data banner. Do not merge or deploy it directly to production. Prepare a narrow production release preserving the existing production URL/key/title/banner, and apply both new migrations to production only as part of that release. Existing production scheduling override is inherited from base 6e3af0d5c9ea1c91c7f1fd1cac0414f5f243b9a9.

Rollback: revert the frontend button/script inclusion. Database objects may remain inaccessible to the UI; no destructive rollback of recorded audit events is needed.
