# Vaporeasy V2 — Production Baseline — 2026-10-04

## Status
Vaporeasy V2 promoted to production on 2026-10-04.

## Production baseline
- Git commit: `2932e622db1768796444a628a9a7fcf63ec090e1`
- Source branch at promotion: `v2-staging`
- Production checkpoint branch: `production/v2-20261004`
- Public domain: `https://vaporeasy.vercel.app`
- Production deployment observed as Ready / Latest / Production.
- Smoke test: owner authentication succeeded and the V2 application loaded successfully on the production domain.

## Validated predecessor
- Functional/security validated deployment: `753d3e74045825ffc7cc6b61891184bcba8fd18d`
- The only code change between that validated baseline and the production baseline above was removal of staging/homologation labels from the UI.

## Database
- V2 Supabase project ref: `asuppjeomaymzromgcrp`
- V1 project ref: `jiimrpulcfoccxizqbac`
- V1 was not migrated, modified, or deleted during this launch.
- V1 remains preserved temporarily as contingency/archive.
- Database pre-production inventory/checkpoint is documented separately under `docs/preprod/V2_DB_CHECKPOINT_2026-10-04.md`.

## Security status
- P0 `AUD-20261004-SEC-01` was corrected and retested before production promotion.
- Anonymous EXECUTE exposure identified during the final audit was hardened in V2.
- Mutable search_path warnings identified during the audit were hardened.
- Remaining accepted limitation: leaked-password protection is unavailable on the current Supabase plan.
- Authenticated SECURITY DEFINER RPC access remains intentional and was reviewed.

## Rollback reference
The previously validated V2 artifact remains identifiable by commit `753d3e74045825ffc7cc6b61891184bcba8fd18d`.
Historical Vercel production deployments remain the deployment-level rollback mechanism.

## Important
Do not delete V1 as part of this checkpoint. Retirement/deletion of V1 is a separate controlled operation.
