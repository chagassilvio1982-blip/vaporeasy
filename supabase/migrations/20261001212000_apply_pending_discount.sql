-- Apply or edit a discount while a completed appointment is still unpaid.
-- Keeps the payment pending so the corrected amount can be shared before receipt confirmation.

create or replace function public.apply_pending_discount(
  p_appointment_id uuid,
  p_discount_type text default 'none',
  p_discount_value numeric default 0
)
returns table(
  gross_amount numeric,
  discount_amount numeric,
  discount_percent numeric,
  final_amount numeric
)
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_role text;
  v_status text;
  v_payment_status text;
  v_gross numeric;
  v_discount numeric;
  v_percent numeric;
  v_final numeric;
  v_type text;
begin
  v_role := private.current_app_role();
  if v_role not in ('owner','admin') then
    raise exception 'Seu perfil não pode aplicar descontos.';
  end if;

  v_type := lower(btrim(coalesce(p_discount_type,'none')));
  if v_type not in ('none','percent','fixed') then
    raise exception 'Tipo de desconto inválido.';
  end if;

  if coalesce(p_discount_value,0) < 0 then
    raise exception 'O desconto não pode ser negativo.';
  end if;

  select a.status,
         greatest(0,coalesce(a.base_value,0)+coalesce(a.addon_value,0))
    into v_status,v_gross
  from public.appointments a
  where a.id=p_appointment_id
    and a.deleted_at is null
  for update;

  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;

  if v_status <> 'completed' then
    raise exception 'O desconto desta tela só pode ser aplicado após a conclusão do atendimento.';
  end if;

  select p.status
    into v_payment_status
  from public.appointment_payments p
  where p.appointment_id=p_appointment_id
  for update;

  if v_payment_status='paid' then
    raise exception 'O pagamento já foi confirmado. Este desconto não pode mais ser alterado nesta etapa.';
  end if;

  if v_type='percent' then
    if p_discount_value > 100 then
      raise exception 'O desconto percentual não pode ser maior que 100%%.';
    end if;
    v_percent := round(coalesce(p_discount_value,0),2);
    v_discount := round(v_gross * v_percent / 100,2);
  elsif v_type='fixed' then
    v_discount := round(coalesce(p_discount_value,0),2);
    if v_discount > v_gross then
      raise exception 'O desconto não pode ser maior que o valor do atendimento.';
    end if;
    v_percent := case when v_gross>0 then round(v_discount/v_gross*100,2) else 0 end;
  else
    v_discount := 0;
    v_percent := 0;
  end if;

  v_final := round(greatest(0,v_gross-v_discount),2);

  update public.appointments
     set discount_amount=v_discount,
         discount_percent=v_percent,
         final_value=v_final,
         updated_by=auth.uid(),
         updated_at=now()
   where id=p_appointment_id;

  insert into public.appointment_payments(
    appointment_id,status,amount,updated_at
  )
  values(
    p_appointment_id,'pending',v_final,now()
  )
  on conflict (appointment_id) do update
     set amount=excluded.amount,
         updated_at=excluded.updated_at
   where public.appointment_payments.status <> 'paid';

  return query select v_gross,v_discount,v_percent,v_final;
end
$function$;

revoke all on function public.apply_pending_discount(uuid,text,numeric) from public;
revoke all on function public.apply_pending_discount(uuid,text,numeric) from anon;
grant execute on function public.apply_pending_discount(uuid,text,numeric) to authenticated;
