-- Prevent concurrent double booking of the same vehicle in isolated homologation.
-- Requires btree_gist; review extension privileges and existing data before applying.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE vaporize_next.appointments
ADD CONSTRAINT next_appointments_no_vehicle_overlap
EXCLUDE USING gist (
  organization_id WITH =,
  vehicle_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&
) WHERE (status <> 'cancelled');
COMMIT;
