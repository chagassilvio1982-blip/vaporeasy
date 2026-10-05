-- Suporte a desconto comercial recorrente em pacotes sem perder o valor de tabela.
-- unit_price * package_units = valor bruto/lista
-- monthly_amount = valor líquido contratado
-- package_charges.gross_monthly_amount preserva o bruto
-- package_charges.amount preserva o saldo líquido após desconto e eventual crédito.

create or replace function private.prepare_package_charge_proration()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_paid numeric(12,2):=0;
  v_gross numeric(12,2);
  v_net numeric(12,2);
begin
  v_gross:=greatest(0,coalesce(new.gross_monthly_amount,new.amount,0));
  v_net:=greatest(0,coalesce(new.amount,v_gross));
  if v_net>v_gross then v_net:=v_gross; end if;

  new.gross_monthly_amount:=v_gross;

  update public.package_charges pc
     set status='cancelled',
         notes=case
           when btrim(coalesce(pc.notes,''))='' then 'Substituída por alteração do pacote no mesmo mês.'
           else pc.notes||E'\nSubstituída por alteração do pacote no mesmo mês.'
         end,
         updated_at=now()
   where pc.client_id=new.client_id
     and pc.vehicle_id=new.vehicle_id
     and pc.competence_month=new.competence_month
     and pc.subscription_id<>new.subscription_id
     and pc.status='pending';

  select coalesce(sum(pc.amount),0)::numeric(12,2)
    into v_paid
  from public.package_charges pc
  where pc.client_id=new.client_id
    and pc.vehicle_id=new.vehicle_id
    and pc.competence_month=new.competence_month
    and pc.subscription_id<>new.subscription_id
    and pc.status='paid';

  new.credit_applied:=least(v_net,v_paid);
  new.amount:=greatest(0,v_net-new.credit_applied);

  if v_gross>v_net then
    new.notes:=case
      when btrim(coalesce(new.notes,''))='' then
        'Desconto comercial aplicado: '||to_char(v_gross-v_net,'FM999999990D00')
      else
        new.notes||E'\nDesconto comercial aplicado: '||to_char(v_gross-v_net,'FM999999990D00')
    end;
  end if;

  if new.amount=0 then
    new.status:='covered';
    new.notes:=case
      when btrim(coalesce(new.notes,''))='' then
        'Mensalidade coberta por valor já pago no mesmo mês.'
      else
        new.notes||E'\nMensalidade coberta por valor já pago no mesmo mês.'
    end;
  elsif new.credit_applied>0 then
    new.status:='pending';
    new.notes:=case
      when btrim(coalesce(new.notes,''))='' then
        'Crédito de pagamento anterior aplicado: '||to_char(new.credit_applied,'FM999999990D00')
      else
        new.notes||E'\nCrédito de pagamento anterior aplicado: '||to_char(new.credit_applied,'FM999999990D00')
    end;
  end if;

  return new;
end
$function$;

create or replace function public.ensure_current_package_charges()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_role text;
  v_month date:=date_trunc('month',current_date)::date;
  v_count integer:=0;
begin
  v_role:=private.current_app_role();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception using errcode='42501',message='Seu perfil não pode gerar cobranças de pacotes.';
  end if;

  perform private.apply_due_package_changes();

  insert into public.package_charges(
    subscription_id,client_id,vehicle_id,service_id,
    competence_month,due_date,frequency,visits_per_month,package_units,
    unit_price,amount,gross_monthly_amount,status
  )
  select
    ps.id,ps.client_id,ps.vehicle_id,ps.service_id,
    v_month,current_date,ps.frequency,ps.visits_per_month,ps.package_units,
    ps.unit_price,ps.monthly_amount,round(ps.unit_price*ps.package_units,2),'pending'
  from public.package_subscriptions ps
  where ps.active
    and ps.starts_on<=current_date
    and date_trunc('month',ps.starts_on)::date<=v_month
  on conflict(subscription_id,competence_month) do nothing;

  get diagnostics v_count=row_count;
  return v_count;
end
$function$;

revoke all on function public.ensure_current_package_charges() from public,anon;
grant execute on function public.ensure_current_package_charges() to authenticated;
