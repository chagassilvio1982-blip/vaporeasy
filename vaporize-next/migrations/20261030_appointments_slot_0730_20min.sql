-- Applied to isolated homologation cfpvexgkjsqpwhebsoos on 2026-10-30.
-- Match UI slot validation; never modify V2 or production.
ALTER TABLE vaporize_next.appointments
ADD CONSTRAINT next_appointments_slot_0730_20min CHECK (
  EXTRACT(SECOND FROM starts_at AT TIME ZONE 'America/Sao_Paulo') = 0
  AND EXTRACT(HOUR FROM starts_at AT TIME ZONE 'America/Sao_Paulo') * 60
    + EXTRACT(MINUTE FROM starts_at AT TIME ZONE 'America/Sao_Paulo') >= 450
  AND MOD((EXTRACT(HOUR FROM starts_at AT TIME ZONE 'America/Sao_Paulo') * 60
    + EXTRACT(MINUTE FROM starts_at AT TIME ZONE 'America/Sao_Paulo') - 450)::integer,20) = 0
);
