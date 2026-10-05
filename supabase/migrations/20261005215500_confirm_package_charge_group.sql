-- Vaporeasy: baixa conjunta de mensalidades de planos do mesmo cliente e competência.
create or replace function public.confirm_package_charge_group(
  p_charge_ids uuid[],
  p_payment_method text,
  p_notes text default ''
)
returns table(total_amount numeric, charge_count integer, status text, paid_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid;
  v_role text;
  v_method text;
  v_count integer;
  v_total numeric;
  v_client_count integer;
  v_competence_count integer;
  v_pending_count integer;
  v_paid_at timestamptz;
begin
  v_uid:=auth.uid();
  if v_uid is null then raise exception 'Autenticação obrigatória.'; end if;

  v_role:=private.current_app_role();
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'Seu perfil não pode confirmar pagamentos.';
  end if;

  v_method:=btrim(coalesce(p_payment_method,''));
  if v_method='' then raise exception 'Informe a forma de pagamento.'; end if;

  v_count:=coalesce(cardinality(p_charge_ids),0);
  if v_count<2 or v_count>20 then
    raise exception 'Selecione de 2 a 20 mensalidades para baixa conjunta.';
  end if;

  if (select count(distinct x) from unnest(p_charge_ids) x)<>v_count then
    raise exception 'Há mensalidades repetidas no grupo.';
  end if;

  perform 1
  from public.package_charges pc
  where pc.id=any(p_charge_ids)
  order by pc.id
  for update;

  if (select count(*) from public.package_charges pc where pc.id=any(p_charge_ids))<>v_count then
    raise exception 'Uma das mensalidades não foi encontrada.';
  end if;

  select
    count(distinct pc.client_id),
    count(distinct pc.competence_month),
    count(*) filter (where pc.status='pending'),
    coalesce(sum(pc.amount),0)
  into v_client_count,v_competence_count,v_pending_count,v_total
  from public.package_charges pc
  where pc.id=any(p_charge_ids);

  if v_client_count<>1 then
    raise exception 'As mensalidades agrupadas precisam pertencer ao mesmo cliente.';
  end if;
  if v_competence_count<>1 then
    raise exception 'As mensalidades agrupadas precisam pertencer ao mesmo mês.';
  end if;
  if v_pending_count<>v_count then
    raise exception 'Todas as mensalidades do grupo precisam estar pendentes.';
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
   where id=any(p_charge_ids);

  return query select v_total,v_count,'paid'::text,v_paid_at;
end
$$;

revoke execute on function public.confirm_package_charge_group(uuid[],text,text) from public;
revoke execute on function public.confirm_package_charge_group(uuid[],text,text) from anon;
grant execute on function public.confirm_package_charge_group(uuid[],text,text) to authenticated;
