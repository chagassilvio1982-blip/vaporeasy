-- HOMOLOGAÇÃO ONLY until explicitly promoted; transactional completion with care decisions.
CREATE TABLE IF NOT EXISTS public.package_visit_care_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 appointment_id uuid NOT NULL REFERENCES public.appointments(id),
 subscription_id uuid NOT NULL REFERENCES public.package_subscriptions(id),
 benefit_id uuid NOT NULL REFERENCES public.package_included_benefits(id),
 outcome text NOT NULL CHECK (outcome IN ('performed','not_performed')),
 confirmed_by uuid NOT NULL REFERENCES auth.users(id),
 confirmed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (appointment_id,benefit_id)
);
ALTER TABLE public.package_visit_care_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.package_visit_care_checks FROM public,anon,authenticated;
GRANT SELECT ON public.package_visit_care_checks TO authenticated;
CREATE POLICY package_visit_care_checks_adm_read ON public.package_visit_care_checks
 FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND (select private.current_app_role()) IN ('owner','admin'));

CREATE FUNCTION public.complete_appointment_with_cares(
 p_appointment_id uuid, p_decisions jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public,private AS $function$
DECLARE
 a public.appointments;
 s public.package_subscriptions;
 b public.package_included_benefits;
 item jsonb;
 care_id uuid;
 status_name text;
 role_name text;
 visit_day date;
 total integer:=0;
 positives integer:=0;
 negatives integer:=0;
BEGIN
 role_name:=private.current_app_role();
 IF auth.uid() IS NULL OR role_name NOT IN ('owner','admin','operator') THEN
  RAISE EXCEPTION USING errcode='42501', message='Perfil sem permissão para concluir.';
 END IF;
 IF p_appointment_id IS NULL THEN RAISE EXCEPTION 'Atendimento obrigatório.'; END IF;
 IF p_decisions IS NULL OR jsonb_typeof(p_decisions)<>'array' OR jsonb_array_length(p_decisions)>30 THEN
  RAISE EXCEPTION 'Informe uma lista válida de até 30 conferências.';
 END IF;
 SELECT * INTO a FROM public.appointments WHERE id=p_appointment_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR a.status<>'in_progress' THEN RAISE EXCEPTION 'Atendimento não está em execução.'; END IF;
 IF role_name='operator' AND NOT private.operator_is_assigned_today(p_appointment_id) THEN
  RAISE EXCEPTION USING errcode='42501', message='Atendimento não atribuído ao operador.';
 END IF;
 visit_day:=(a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
 IF visit_day>(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
  RAISE EXCEPTION 'Não é permitido concluir um atendimento futuro.';
 END IF;
 IF a.recurring_plan_id IS NOT NULL THEN
  SELECT p.* INTO s FROM public.package_subscriptions p
   WHERE p.recurring_plan_id=a.recurring_plan_id AND p.client_id=a.client_id
    AND p.vehicle_id=a.vehicle_id AND p.starts_on<=visit_day
   ORDER BY p.starts_on DESC,p.created_at DESC LIMIT 1;
 END IF;
 IF s.id IS NULL AND jsonb_array_length(p_decisions)>0 THEN
  RAISE EXCEPTION 'Este atendimento não possui plano contratado.';
 END IF;
 -- Existing completion trigger handles finance exactly as before.
 UPDATE public.appointments SET status='completed',completed_at=coalesce(completed_at,now()),
  updated_by=auth.uid(),updated_at=now()
  WHERE id=a.id AND status='in_progress' AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível concluir atendimento.'; END IF;

 FOR item IN SELECT value FROM jsonb_array_elements(p_decisions) LOOP
  IF jsonb_typeof(item)<>'object'
    OR jsonb_typeof(item->'benefit_id')<>'string'
    OR jsonb_typeof(item->'performed')<>'boolean' THEN
   RAISE EXCEPTION 'Cada cuidado exige um identificador e confirmação de execução.';
  END IF;
  care_id:=(item->>'benefit_id')::uuid;
  status_name:=CASE WHEN (item->>'performed')::boolean THEN 'performed' ELSE 'not_performed' END;
  SELECT * INTO b FROM public.package_included_benefits
   WHERE id=care_id AND subscription_id=s.id
     AND effective_from_month<=date_trunc('month',visit_day)::date
     AND (retired_from_month IS NULL OR retired_from_month>date_trunc('month',visit_day)::date);
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuidado não contratado ou fora da vigência.'; END IF;
  INSERT INTO public.package_visit_care_checks(appointment_id,subscription_id,benefit_id,outcome,confirmed_by)
   VALUES(a.id,s.id,b.id,status_name,auth.uid());
  -- Only affirmative decisions create a performed event; no charge is created.
  IF status_name='performed' THEN
   IF NOT EXISTS (
    SELECT 1 FROM public.package_service_events e WHERE e.appointment_id=a.id
      AND e.subscription_id=s.id AND e.voided_at IS NULL
      AND lower(btrim(e.service_label))=lower(btrim(b.service_label))
   ) THEN
    INSERT INTO public.package_service_events(subscription_id,appointment_id,performed_on,service_label,notes,request_key,created_by)
     VALUES(s.id,a.id,visit_day,b.service_label,'Confirmado na conclusão do atendimento',gen_random_uuid(),auth.uid());
   END IF;
   positives:=positives+1;
  ELSE
   negatives:=negatives+1;
  END IF;
  total:=total+1;
 END LOOP;
 RETURN jsonb_build_object('appointment_id',a.id,'care_confirmed',positives,
  'care_not_performed',negatives,'care_checked',total);
END $function$;
REVOKE ALL ON FUNCTION public.complete_appointment_with_cares(uuid,jsonb) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.complete_appointment_with_cares(uuid,jsonb) TO authenticated;
