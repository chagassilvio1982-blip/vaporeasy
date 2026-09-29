-- R0: somente asuppjeomaymzromgcrp. Executar via execute_sql no staging.
-- Fixture transacional, desfeita por exceção interna; nenhum registro real alterado.
-- Storage contém apenas metadados sintéticos na transação: NÃO certifica upload/foto E2E.
do $r0$
declare u uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); results jsonb:='[]'; err text; code text;
begin
 begin
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(u,'authenticated','authenticated','r0-'||u||'@example.invalid','{}','{}',now(),now());
 insert into public.app_profiles(user_id,name,role,active) values(u,'R0_SYNTHETIC_20260929','admin',true) on conflict(user_id) do update set name=excluded.name,role='admin',active=true;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 insert into public.clients(id,name,notes) values(c,'R0_SYNTHETIC_20260929','Transactional fixture; rollback');
 insert into public.vehicles(id,client_id,brand,model) values(v,c,'R0_SYNTHETIC','BASELINE');
 insert into public.services(id,name,price,duration_minutes) values(s,'R0_SYNTHETIC_20260929',150,90);
 insert into public.appointments(id,client_id,vehicle_id,service_id,starts_at,duration_minutes,base_value,final_value,notes) values(a,c,v,s,'2040-01-03 10:00:00-03',90,150,150,'R0_SYNTHETIC_20260929');
 update public.appointments set status='in_progress' where id=a;
 results:=results||jsonb_build_array(jsonb_build_object('case','scheduled_to_in_progress','result','PASS'));
 begin
 perform public.complete_job_without_photo(a,'Justificativa sintética válida para caracterização R0.');
 results:=results||jsonb_build_array(jsonb_build_object('case','completion_without_photo','result','PASS'));
 exception when others then get stacked diagnostics err=MESSAGE_TEXT,code=RETURNED_SQLSTATE;
 results:=results||jsonb_build_array(jsonb_build_object('case','completion_without_photo','result','FAIL_PREEXISTING','sqlstate',code,'error',err));
 end;
 results:=results||jsonb_build_array(jsonb_build_object('case','atomic_failure','status',(select status from public.appointments where id=a),'exception_rows',(select count(*) from public.appointment_completion_exceptions where appointment_id=a)));
 begin
 perform public.complete_job_without_photo(a,'curta');
 exception when others then get stacked diagnostics err=MESSAGE_TEXT,code=RETURNED_SQLSTATE;
 results:=results||jsonb_build_array(jsonb_build_object('case','short_reason_rejected','sqlstate',code,'message',err));
 end;

 insert into storage.objects(bucket_id,name,owner_id) values('completion-photos',a::text||'/'||u::text||'/final.jpg',u::text);
 insert into public.appointment_completion_photos(appointment_id,storage_path,uploaded_by,uploaded_by_name) values(a,a::text||'/'||u::text||'/final.jpg',u,'R0_SYNTHETIC');
 insert into public.appointment_completion_exceptions(appointment_id,reason,recorded_by,recorded_by_name) values(a,'Preparação sintética para teste isolado do desconto.',u,'R0_SYNTHETIC');
 update public.appointments set status='completed' where id=a;
 results:=results||jsonb_build_array(jsonb_build_object('case','payment_pending_on_completion','payment',(select jsonb_build_object('status',status,'amount',amount) from public.appointment_payments where appointment_id=a)));
 begin
 perform public.confirm_payment_with_discount(a,'pix','percent',10,'R0_SYNTHETIC');
 results:=results||jsonb_build_array(jsonb_build_object('case','discount_10_percent','result','PASS'));
 exception when others then get stacked diagnostics err=MESSAGE_TEXT,code=RETURNED_SQLSTATE;
 results:=results||jsonb_build_array(jsonb_build_object('case','discount_10_percent','result','FAIL_PREEXISTING','sqlstate',code,'error',err));
 end;
 begin
 perform public.confirm_payment_with_discount(a,'pix','fixed',15,'R0_SYNTHETIC');
 results:=results||jsonb_build_array(jsonb_build_object('case','discount_fixed_15','result','PASS'));
 exception when others then get stacked diagnostics err=MESSAGE_TEXT,code=RETURNED_SQLSTATE;
 results:=results||jsonb_build_array(jsonb_build_object('case','discount_fixed_15','result','FAIL_PREEXISTING','sqlstate',code,'error',err));
 end;
 begin
 perform public.confirm_payment_with_discount(a,'pix','none',0,'R0_SYNTHETIC');
 results:=results||jsonb_build_array(jsonb_build_object('case','payment_without_discount','result','PASS','payment',(select jsonb_build_object('status',status,'amount',amount) from public.appointment_payments where appointment_id=a)));
 exception when others then get stacked diagnostics err=MESSAGE_TEXT,code=RETURNED_SQLSTATE;
 results:=results||jsonb_build_array(jsonb_build_object('case','payment_without_discount','result','FAIL','sqlstate',code,'error',err));
 end;

 raise exception using errcode='ZR000',message='R0 rollback fixtures';
 exception when sqlstate 'ZR000' then null;
 end;
 perform set_config('r0.results',results::text,false);
end $r0$;
select current_setting('r0.results')::jsonb as results;
