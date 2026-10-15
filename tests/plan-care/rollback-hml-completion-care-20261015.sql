-- APENAS HOMOLOGAÇÃO: rollback manual da conferência de cuidados de 15/10/2026.
-- NÃO executar em produção. Caso haja decisões de teste/uso, preservar dados e revisar manualmente.
BEGIN;
DO $rollback$
BEGIN
 IF EXISTS (SELECT 1 FROM public.package_visit_care_checks LIMIT 1) THEN
  RAISE EXCEPTION 'Existem decisões registradas. Preserve/exporte dados antes de qualquer rollback estrutural.';
 END IF;
END $rollback$;
DROP FUNCTION IF EXISTS public.complete_appointment_with_cares(uuid,jsonb);
DROP POLICY IF EXISTS package_visit_care_checks_adm_read ON public.package_visit_care_checks;
DROP TABLE IF EXISTS public.package_visit_care_checks;
COMMIT;
