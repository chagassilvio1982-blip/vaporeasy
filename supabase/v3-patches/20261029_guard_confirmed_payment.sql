-- Vaporeasy V3: prevent modification of already-paid appointment payments.
-- Prepared for isolated homologation; DO NOT run on V2/production without validation.
CREATE OR REPLACE FUNCTION public.confirm_payment_with_discount(
  p_appointment_id uuid, p_payment_method text,
  p_discount_type text DEFAULT 'none'::text,
  p_discount_value numeric DEFAULT 0,
  p_notes text DEFAULT ''::text
)
RETURNS TABLE(gross_amount numeric, discount_amount numeric, discount_percent numeric, final_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_uid uuid;
  v_role text;
  v_status text;
  v_gross numeric;
  v_discount numeric;
  v_percent numeric;
  v_final numeric;
  v_type text;
  v_method text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação obrigatória.'; END IF;
  v_role := private.current_app_role();
  IF v_role IS NULL OR v_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Seu perfil não pode confirmar pagamentos.';
  END IF;
  v_method := btrim(coalesce(p_payment_method,''));
  IF v_method = '' THEN RAISE EXCEPTION 'Informe a forma de pagamento.'; END IF;
  v_type := lower(btrim(coalesce(p_discount_type,'none')));
  IF v_type NOT IN ('none','percent','fixed') THEN RAISE EXCEPTION 'Tipo de desconto inválido.'; END IF;
  IF coalesce(p_discount_value,0) < 0 THEN RAISE EXCEPTION 'O desconto não pode ser negativo.'; END IF;

  SELECT a.status, greatest(0,coalesce(a.base_value,0)+coalesce(a.addon_value,0))
  INTO v_status,v_gross
  FROM public.appointments a
  WHERE a.id=p_appointment_id AND a.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento não encontrado.'; END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'Conclua o atendimento antes de confirmar o pagamento.';
  END IF;

  -- The appointment row lock serializes concurrent confirmations for this appointment.
  -- The paid check must occur BEFORE updating appointment totals or payment metadata.
  IF EXISTS (
    SELECT 1 FROM public.appointment_payments p
    WHERE p.appointment_id=p_appointment_id AND p.status='paid'
  ) THEN
    RAISE EXCEPTION 'Este atendimento já está pago. O pagamento confirmado não pode ser alterado.';
  END IF;

  IF v_type='percent' THEN
    IF p_discount_value > 100 THEN RAISE EXCEPTION 'O desconto percentual não pode ser maior que 100%%.'; END IF;
    v_percent := coalesce(p_discount_value,0);
    v_discount := round(v_gross * v_percent / 100,2);
  ELSIF v_type='fixed' THEN
    v_discount := round(coalesce(p_discount_value,0),2);
    IF v_discount > v_gross THEN RAISE EXCEPTION 'O desconto não pode ser maior que o valor do atendimento.'; END IF;
    v_percent := CASE WHEN v_gross>0 THEN round(v_discount/v_gross*100,4) ELSE 0 END;
  ELSE
    v_discount := 0;
    v_percent := 0;
  END IF;
  v_final := round(greatest(0,v_gross-v_discount),2);
  UPDATE public.appointments
  SET discount_amount=v_discount,discount_percent=v_percent,final_value=v_final,
      updated_by=v_uid,updated_at=now()
  WHERE id=p_appointment_id;
  INSERT INTO public.appointment_payments(
    appointment_id,status,amount,payment_method,paid_at,notes,confirmed_by,updated_at
  )
  VALUES(p_appointment_id,'paid',v_final,v_method,now(),coalesce(p_notes,''),v_uid,now())
  ON CONFLICT (appointment_id) DO UPDATE
  SET status='paid',amount=excluded.amount,payment_method=excluded.payment_method,
      paid_at=excluded.paid_at,notes=excluded.notes,confirmed_by=excluded.confirmed_by,
      updated_at=excluded.updated_at
  WHERE public.appointment_payments.status <> 'paid';
  RETURN QUERY SELECT v_gross,v_discount,v_percent,v_final;
END
$function$;
