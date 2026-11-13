#!/usr/bin/env bash
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-receipt_ci}"
export PGHOST PGPORT PGUSER PGDATABASE

CLIENT_ID="dcdcdcdc-dcdc-4dcd-8dcd-dcdcdcdcdcdc"
CHARGE_ID="edededed-eded-4ded-8ded-edededededed"
COMPETENCE="2026-12-01"
PAYLOAD='[{"kind":"package_charge","id":"edededed-eded-4ded-8ded-edededededed","amount":100}]'

psql -v ON_ERROR_STOP=1 -c "insert into public.clients(id) values ('${CLIENT_ID}');
insert into public.vehicles(id,client_id,brand,model,plate) values ('e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1','${CLIENT_ID}','Audi','A4','XYZ1A23');
insert into public.services(id,name) values ('f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1','Plano mensal');
insert into public.package_subscriptions(id,client_id,vehicle_id,service_id,starts_on) values ('e0e0e0e0-e0e0-40e0-80e0-e0e0e0e0e0e0','${CLIENT_ID}','e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1','f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1','2026-11-01');
insert into public.package_charges(id,subscription_id,client_id,vehicle_id,service_id,competence_month,status,amount)
values ('${CHARGE_ID}','e0e0e0e0-e0e0-40e0-80e0-e0e0e0e0e0e0','${CLIENT_ID}','e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1','f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1','${COMPETENCE}','pending',100);"

FIRST_LOG="$(mktemp)"
SECOND_LOG="$(mktemp)"
LOCKED_FILE="$(mktemp)"
rm -f "$LOCKED_FILE"
trap 'rm -f "$FIRST_LOG" "$SECOND_LOG" "$LOCKED_FILE"' EXIT

(
  psql -v ON_ERROR_STOP=1 >"$FIRST_LOG" 2>&1 <<SQL
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('${CLIENT_ID}:${COMPETENCE}',0));
\! touch "$LOCKED_FILE"
SELECT pg_sleep(2);
SELECT public.issue_selected_monthly_receipt('${CLIENT_ID}','${COMPETENCE}','${PAYLOAD}'::jsonb);
COMMIT;
SQL
) &
FIRST_PID=$!

for _ in {1..50}; do
  [[ -f "$LOCKED_FILE" ]] && break
  sleep 0.1
done
if [[ ! -f "$LOCKED_FILE" ]]; then
  echo "First session did not acquire the advisory lock."
  cat "$FIRST_LOG"
  wait "$FIRST_PID" || true
  exit 1
fi

set +e
psql -v ON_ERROR_STOP=1 -c "SELECT public.issue_selected_monthly_receipt('${CLIENT_ID}','${COMPETENCE}','${PAYLOAD}'::jsonb);" >"$SECOND_LOG" 2>&1
SECOND_STATUS=$?
wait "$FIRST_PID"
FIRST_STATUS=$?
set -e

if [[ "$FIRST_STATUS" -ne 0 || "$SECOND_STATUS" -eq 0 ]] || ! grep -q "Monthly receipt already issued" "$SECOND_LOG"; then
  echo "Concurrent issuance guard failed."
  echo "--- first session ---"
  cat "$FIRST_LOG"
  echo "--- second session ---"
  cat "$SECOND_LOG"
  exit 1
fi

COUNT="$(psql -At -v ON_ERROR_STOP=1 -c "select count(*) from public.monthly_billing_documents where client_id='${CLIENT_ID}' and competence_month='${COMPETENCE}';")"
if [[ "$COUNT" != "1" ]]; then
  echo "Expected exactly one monthly document, found $COUNT."
  exit 1
fi

echo "Concurrent issuance serialized: one document created, second request rejected."
