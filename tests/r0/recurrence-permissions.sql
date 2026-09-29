-- R0: somente staging asuppjeomaymzromgcrp. Teste da barreira de permissões.
-- Esperado na baseline: SQLSTATE 42501 em INSERT e UPDATE.
do $r0$
declare results jsonb:='[]'; err text; code text;
begin
 execute 'set local role authenticated';
 begin
 insert into public.recurring_plans default values;
 results:=results||jsonb_build_array(jsonb_build_object('case','rg_insert_permission','result','UNEXPECTED'));
 exception when others then get stacked diagnostics err=MESSAGE_TEXT,code=RETURNED_SQLSTATE;
 results:=results||jsonb_build_array(jsonb_build_object('case','rg_insert_permission','sqlstate',code,'error',err));
 end;
 begin
 update public.recurring_plans set active=active where false;
 results:=results||jsonb_build_array(jsonb_build_object('case','rg_update_permission','result','PERMITTED'));
 exception when others then get stacked diagnostics err=MESSAGE_TEXT,code=RETURNED_SQLSTATE;
 results:=results||jsonb_build_array(jsonb_build_object('case','rg_update_permission','sqlstate',code,'error',err));
 end;
 execute 'reset role';
 perform set_config('r0.results',results::text,false);
end $r0$;
select current_setting('r0.results')::jsonb as results;
