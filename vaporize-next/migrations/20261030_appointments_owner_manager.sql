-- Vaporize Next: isolated homologation migration. Apply only after review.
-- Existing read-only policies are preserved. Writes restricted to active owner/manager.
BEGIN;
CREATE POLICY next_appointments_insert_owner_manager
ON vaporize_next.appointments FOR INSERT TO authenticated
WITH CHECK (
  vaporize_next.can_manage_clients(organization_id)
  AND status = 'scheduled'
  AND ends_at > starts_at
);
CREATE POLICY next_appointments_update_owner_manager
ON vaporize_next.appointments FOR UPDATE TO authenticated
USING (vaporize_next.can_manage_clients(organization_id))
WITH CHECK (vaporize_next.can_manage_clients(organization_id));
-- No DELETE policy: preserve auditability and cancel via status.
COMMIT;
