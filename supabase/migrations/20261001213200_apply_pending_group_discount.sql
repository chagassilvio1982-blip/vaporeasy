-- Apply one discount to a grouped pending document and distribute it proportionally
-- across the included completed appointments. The operation is atomic.

create or replace function public.apply_pending_group_discount(
  p_appointment_ids uuid[],
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
  v_type text;
  v_ids uuid[];
  v_count integer;
  v_client_count integer;
  v_day_count integer;
  v_gross numeric;
  v_discount numeric;
  v_percent numeric;
  v_final numeric;
  v_allocated numeric := 0;
  v_alloc numeric;
  v_index integer := 0;
  r record;
begin
  v_role := private.current_app_role();
  if v_role not in ('owner','admin') then
    raise exception 'Seu perfil não pode aplicar descontos.';
  end if;

  select array_agg(id order by id)
    into v_ids
  from (
    select distinct x as id
    from unnest(coalesce(p_appointment_ids,'{}'::uuid[])) x
    where x is not null
  ) q;

  if coalesce(cardinality(v_ids),0) < 2 then
    raise exception 'Selecione pelo menos dois atendimentos.';
  end if;

  v_type := lower(btrim(coalesce(p_discount_type,'none')));
  if v_type not in ('none','percent','fixed') then
    raise exception 'Tipo de desconto inválido.';
  end if;

  if coalesce(p_discount_value,0) < 0 then
    raise exception 'O desconto não pode ser negativo.';
  end if;

  select
    count(*),
    count(distinct client_id),
    count(distinct (completed_at at time zone 'America/Sao_Paulo')::date),
    round(sum(greatest(0,coalesce(base_value,0)+coalesce(addon_value,0))),2)
  into v_count,v_client_count,v_day_count,v_gross
  from public.appointments
  where id = any(v_ids)
    and deleted_at is null
    and status='completed';

  if v_count <> cardinality(v_ids) then
    raise exception 'Um dos atendimentos não está concluído ou não foi encontrado.';
  end if;

  if v_client_count <> 1 then
    raise exception 'O desconto conjunto só pode ser aplicado a atendimentos do mesmo cliente.';
  end if;

  if v_day_count <> 1 then
    raise exception 'O desconto conjunto só pode ser aplicado a atendimentos do mesmo dia.';
  end if;

  if exists(
    select 1
    from public.appointment_payments p
    where p.appointment_id = any(v_ids)
      and p.status='paid'
  ) then
    raise exception 'Há atendimento já pago neste grupo. O desconto conjunto só pode ser alterado enquanto todos estiverem pendentes.';
  end if;

  v_gross := coalesce(v_gross,0);

  if v_type='percent' then
    if p_discount_value > 100 then
      raise exception 'O desconto percentual não pode ser maior que 100%%.';
    end if;
    v_percent := round(coalesce(p_discount_value,0),2);
    v_discount := round(v_gross * v_percent / 100,2);
  elsif v_type='fixed' then
    v_discount := round(coalesce(p_discount_value,0),2);
    if v_discount > v_gross then
      raise exception 'O desconto não pode ser maior que o total dos atendimentos.';
    end if;
    v_percent := case when v_gross>0 then round(v_discount/v_gross*100,2) else 0 end;
  else
    v_discount := 0;
    v_percent := 0;
  end if;

  v_final := round(greatest(0,v_gross-v_discount),2);

  for r in
    select id,
           round(greatest(0,coalesce(base_value,0)+coalesce(addon_value,0)),2) as gross
    from public.appointments
    where id = any(v_ids)
    order by completed_at,id
    for update
  loop
    v_index := v_index + 1;

    if v_index = cardinality(v_ids) then
      v_alloc := round(v_discount-v_allocated,2);
    elsif v_gross > 0 then
      v_alloc := round(v_discount * r.gross / v_gross,2);
    else
      v_alloc := 0;
    end if;

    v_alloc := greatest(0,least(r.gross,v_alloc));
    v_allocated := round(v_allocated+v_alloc,2);

    perform public.apply_pending_discount(
      r.id,
      'fixed',
      v_alloc
    );
  end loop;

  return query select v_gross,v_discount,v_percent,v_final;
end
$function$;

revoke all on function public.apply_pending_group_discount(uuid[],text,numeric) from public;
revoke all on function public.apply_pending_group_discount(uuid[],text,numeric) from anon;
grant execute on function public.apply_pending_group_discount(uuid[],text,numeric) to authenticated;
