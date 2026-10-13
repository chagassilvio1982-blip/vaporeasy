-- Vaporeasy V2: retirar exigencia de fotografia ao concluir atendimentos.
-- Preserva permissoes, atribuicao do operador, transicoes de status,
-- carimbo de tempo do servidor e regras de recebimento para planos.
-- Nao apaga fotos ou justificativas historicas.

DROP TRIGGER IF EXISTS appointments_require_completion_photo ON public.appointments;

CREATE OR REPLACE FUNCTION private.v2_guard_appointment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_gross numeric; v_expected_percent numeric; v_role text;
begin
  if TG_OP='INSERT' then
    if new.status not in ('requested','scheduled') or new.completed_at is not null
       or new.cancelled_at is not null or new.deleted_at is not null then
      raise exception using errcode='42501',message='Novo atendimento deve iniciar como solicitado ou agendado.';
    end if;
  else
    if old.status in ('completed','cancelled','no_show') then
      if old.status='completed' then
        if (to_jsonb(new)-'updated_at'-'updated_by'-'discount_amount'-'discount_percent'-'final_value') is distinct from
           (to_jsonb(old)-'updated_at'-'updated_by'-'discount_amount'-'discount_percent'-'final_value') then
          raise exception using errcode='42501',message='Atendimento encerrado não pode ser reaberto ou reescrito.';
        end if;
        v_gross := greatest(0,coalesce(old.base_value,0)+coalesce(old.addon_value,0));
        if coalesce(new.discount_amount,0) < 0 or coalesce(new.discount_amount,0) > v_gross then
          raise exception using errcode='42501',message='Desconto inválido para atendimento concluído.';
        end if;
        if round(coalesce(new.final_value,0),2) <> round(greatest(0,v_gross-coalesce(new.discount_amount,0)),2) then
          raise exception using errcode='42501',message='Valor final inconsistente com o desconto informado.';
        end if;
        v_expected_percent := case when v_gross > 0 then round(coalesce(new.discount_amount,0)/v_gross*100,2) else 0 end;
        if round(coalesce(new.discount_percent,0),2) <> v_expected_percent then
          raise exception using errcode='42501',message='Percentual de desconto inconsistente.';
        end if;
      else
        if (to_jsonb(new)-'updated_at'-'updated_by') is distinct from
           (to_jsonb(old)-'updated_at'-'updated_by') then
          raise exception using errcode='42501',message='Atendimento encerrado não pode ser reaberto ou reescrito.';
        end if;
      end if;
    end if;

    if new.status is distinct from old.status and not (
      (old.status='requested' and new.status in ('confirmed','cancelled')) or
      (old.status='scheduled' and new.status in ('confirmed','in_progress','cancelled','no_show')) or
      (old.status='confirmed' and new.status in ('in_progress','cancelled','no_show')) or
      (old.status='in_progress' and new.status in ('completed','cancelled'))
    ) then
      raise exception using errcode='42501',message='Transição de atendimento não permitida.';
    end if;

    if new.status='completed' and old.status<>'completed' then
      v_role := private.current_app_role();
      if new.source='retroactive' and v_role in ('owner','admin') then
        if new.completed_at is null then
          new.completed_at := least(coalesce(new.ends_at,clock_timestamp()),clock_timestamp());
        elsif new.completed_at > clock_timestamp() then
          raise exception using errcode='42501',message='Horário de conclusão retroativa não pode estar no futuro.';
        end if;
      else
        new.completed_at := clock_timestamp();
      end if;
    elsif new.completed_at is distinct from old.completed_at then
      raise exception using errcode='42501',message='Horário de conclusão é registrado pelo servidor.';
    end if;

    if new.status='cancelled' and old.status<>'cancelled' then
      new.cancelled_at:=clock_timestamp();
    elsif new.cancelled_at is distinct from old.cancelled_at then
      raise exception using errcode='42501',message='Horário de cancelamento é registrado pelo servidor.';
    end if;
  end if;

  if auth.uid() is not null then new.updated_by:=auth.uid(); end if;
  return new;
end
$function$

CREATE OR REPLACE FUNCTION public.operator_complete_job(p_appointment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$

declare
  changed integer;
begin
  if private.current_app_role() is distinct from 'operator' then
    raise exception 'Ação disponível apenas para operador.';
  end if;

  if not private.operator_is_assigned_today(p_appointment_id) then
    raise exception 'Atendimento não atribuído ao operador.';
  end if;

  update public.appointments
     set status = 'completed',
         completed_at = coalesce(completed_at, now()),
         updated_by = auth.uid(),
         updated_at = now()
   where id = p_appointment_id
     and deleted_at is null
     and status = 'in_progress';

  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'Atendimento não está em execução.';
  end if;
  return true;
end

$function$
