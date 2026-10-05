-- Homologação isolada
-- Ajuste de upgrade de pacote no mesmo mês:
-- reaproveita o que já foi pago pelo mesmo veículo e cobra somente a diferença.

alter table public.package_charges
  add column if not exists gross_monthly_amount numeric(12,2),
  add column if not exists credit_applied numeric(12,2) not null default 0;

update public.package_charges
set gross_monthly_amount=coalesce(gross_monthly_amount,amount),
    credit_applied=coalesce(credit_applied,0)
where gross_monthly_amount is null;

alter table public.package_charges
  alter column gross_monthly_amount set not null;

alter table public.package_charges
  drop constraint if exists package_charges_status_check;

alter table public.package_charges
  add constraint package_charges_status_check
  check (status in ('pending','paid','covered','cancelled'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='package_charges_gross_monthly_amount_check'
      and conrelid='public.package_charges'::regclass
  ) then
    alter table public.package_charges
      add constraint package_charges_gross_monthly_amount_check
      check (gross_monthly_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='package_charges_credit_applied_check'
      and conrelid='public.package_charges'::regclass
  ) then
    alter table public.package_charges
      add constraint package_charges_credit_applied_check
      check (credit_applied >= 0);
  end if;
end $$;

create or replace function private.prepare_package_charge_proration()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_paid numeric(12,2):=0;
  v_original numeric(12,2);
begin
  v_original:=greatest(0,coalesce(new.gross_monthly_amount,new.amount,0));
  new.gross_monthly_amount:=v_original;

  -- Cobranças pendentes anteriores do mesmo veículo/mês são substituídas.
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

  -- Valores efetivamente pagos no mesmo mês/veículo viram crédito para a nova mensalidade.
  select coalesce(sum(pc.amount),0)::numeric(12,2)
    into v_paid
  from public.package_charges pc
  where pc.client_id=new.client_id
    and pc.vehicle_id=new.vehicle_id
    and pc.competence_month=new.competence_month
    and pc.subscription_id<>new.subscription_id
    and pc.status='paid';

  new.credit_applied:=least(v_original,v_paid);
  new.amount:=greatest(0,v_original-new.credit_applied);

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

drop trigger if exists package_charges_proration_before_insert on public.package_charges;
create trigger package_charges_proration_before_insert
before insert on public.package_charges
for each row execute function private.prepare_package_charge_proration();

-- Corrige cobranças pendentes já existentes na homologação antes desta migration.
with paid as (
  select
    p.client_id,
    p.vehicle_id,
    p.competence_month,
    sum(p.amount)::numeric(12,2) as paid_amount
  from public.package_charges p
  where p.status='paid'
  group by p.client_id,p.vehicle_id,p.competence_month
),
calc as (
  select
    c.id,
    c.amount as original_amount,
    least(c.amount,coalesce(p.paid_amount,0))::numeric(12,2) as credit
  from public.package_charges c
  left join paid p
    on p.client_id=c.client_id
   and p.vehicle_id=c.vehicle_id
   and p.competence_month=c.competence_month
  where c.status='pending'
)
update public.package_charges c
set gross_monthly_amount=calc.original_amount,
    credit_applied=calc.credit,
    amount=greatest(0,calc.original_amount-calc.credit),
    status=case when greatest(0,calc.original_amount-calc.credit)=0 then 'covered' else 'pending' end,
    notes=case
      when calc.credit>0 and btrim(coalesce(c.notes,''))='' then
        'Crédito de pagamento anterior aplicado: '||to_char(calc.credit,'FM999999990D00')
      when calc.credit>0 then
        c.notes||E'\nCrédito de pagamento anterior aplicado: '||to_char(calc.credit,'FM999999990D00')
      else c.notes
    end,
    updated_at=now()
from calc
where c.id=calc.id;

-- Evita alteração acidental de cobrança já quitada em eventual retry do mesmo registro.
create or replace function public.confirm_package_charge(
  p_charge_id uuid,
  p_payment_method text,
  p_notes text default ''::text
)
returns table(amount numeric,status text,paid_at timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_uid uuid;
  v_role text;
  v_method text;
  v_amount numeric;
  v_paid_at timestamptz;
  v_status text;
begin
  v_uid:=auth.uid();
  if v_uid is null then raise exception 'Autenticação obrigatória.'; end if;
  v_role:=private.current_app_role();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'Seu perfil não pode confirmar pagamentos.';
  end if;
  v_method:=btrim(coalesce(p_payment_method,''));
  if v_method='' then raise exception 'Informe a forma de pagamento.'; end if;

  select pc.amount,pc.status
    into v_amount,v_status
  from public.package_charges pc
  where pc.id=p_charge_id
    and pc.status<>'cancelled'
  for update;

  if not found then raise exception 'Cobrança de pacote não encontrada.'; end if;
  if v_status='covered' then
    raise exception 'Esta mensalidade já está coberta por pagamento anterior.';
  end if;
  if v_status='paid' then
    select pc.paid_at into v_paid_at
    from public.package_charges pc
    where pc.id=p_charge_id;
    return query select v_amount,'paid'::text,v_paid_at;
    return;
  end if;

  v_paid_at:=now();
  update public.package_charges
     set status='paid',
         payment_method=v_method,
         paid_at=v_paid_at,
         notes=case
           when btrim(coalesce(p_notes,''))='' then notes
           when btrim(coalesce(notes,''))='' then p_notes
           else notes||E'\n'||p_notes
         end,
         confirmed_by=v_uid,
         updated_at=now()
   where id=p_charge_id;

  return query select v_amount,'paid'::text,v_paid_at;
end
$function$;

revoke all on function public.confirm_package_charge(uuid,text,text) from public,anon;
grant execute on function public.confirm_package_charge(uuid,text,text) to authenticated;
