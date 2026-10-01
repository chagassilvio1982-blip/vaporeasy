-- Allow post-completion financial settlement without reopening or rewriting service data.
-- Only discount_amount, discount_percent and final_value may change on completed appointments.
-- Cancelled/no-show appointments remain fully immutable.

create or replace function private.v2_guard_appointment()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_gross numeric;
  v_expected_percent numeric;
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

        v_expected_percent := case
          when v_gross > 0 then round(coalesce(new.discount_amount,0)/v_gross*100,2)
          else 0
        end;

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
      if not exists(
        select 1
        from public.appointment_completion_photos p
        join storage.objects o
          on o.bucket_id='completion-photos'
         and o.name=p.storage_path
        where p.appointment_id=new.id
      )
      and not exists(
        select 1
        from public.appointment_completion_exceptions e
        where e.appointment_id=new.id
          and length(btrim(e.reason)) >= 10
      ) then
        raise exception using errcode='42501',
          message='Registre uma foto final válida ou uma justificativa de exceção antes de concluir.';
      end if;
      new.completed_at:=clock_timestamp();
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
$function$;
