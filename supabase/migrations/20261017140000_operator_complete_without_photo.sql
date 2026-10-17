-- Vaporeasy V2: conclusao sem fotografia obrigatoria.
-- A funcao permanece SECURITY DEFINER, com verificacoes de perfil, atribuicao e estado.
-- CREATE OR REPLACE preserva os GRANTs ja existentes; sem alterar registros historicos.
CREATE OR REPLACE FUNCTION public.operator_complete_job(p_appointment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  changed integer;
BEGIN
  IF private.current_app_role() IS DISTINCT FROM 'operator' THEN
    RAISE EXCEPTION 'Ação disponível apenas para operador.';
  END IF;

  IF NOT private.operator_is_assigned_today(p_appointment_id) THEN
    RAISE EXCEPTION 'Atendimento não atribuído ao operador.';
  END IF;

  UPDATE public.appointments
     SET status = 'completed',
         completed_at = coalesce(completed_at, now()),
         updated_by = auth.uid(),
         updated_at = now()
   WHERE id = p_appointment_id
     AND deleted_at IS NULL
     AND status = 'in_progress';

  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN
    RAISE EXCEPTION 'Atendimento não está em execução.';
  END IF;
  RETURN true;
END
$function$;
