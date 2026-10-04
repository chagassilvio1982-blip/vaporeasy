# Vaporeasy V2 — checkpoint pré-produção do banco

Data: 2026-10-04
Projeto Supabase V2: `asuppjeomaymzromgcrp`
Branch de código congelada: `backup/v2-preprod-checkpoint-20261004`
Commit de código base: `753d3e74045825ffc7cc6b61891184bcba8fd18d`

## Finalidade

Registro declarativo do estado observado do banco V2 antes da promoção. Este arquivo NÃO é um dump SQL e NÃO pretende reconstruir migrations históricas ausentes do repositório. Nenhum SQL histórico foi inventado.

## Inventário observado

- public: 27 tabelas, 6 views, 23 funções
- private: 8 tabelas, 30 funções
- storage: 8 tabelas
- RLS habilitado em 27 tabelas public
- 90 policies em public

## Histórico registrado no Supabase (76 migrations)

- 20260927090841 create_v2_core_foundation
- 20260927090914 index_audit_foreign_keys
- 20260927091225 enforce_schedule_and_client_vehicle_integrity_v2
- 20260927091248 harden_overlap_extension_and_composite_indexes
- 20260927091328 seed_service_catalog_from_production
- 20260927105900 enforce_service_duration_and_first_slot
- 20260927111015 add_vehicle_brand_model_catalog
- 20260927111731 expand_vehicle_brand_catalog
- 20260927112741 add_schedule_availability_engine
- 20260927114005 add_public_booking_notifications
- 20260927114715 public_booking_v2_foundation
- 20260927114745 public_booking_available_dates
- 20260927114844 public_booking_vehicle_aware_availability
- 20260927115613 personalized_public_booking_links
- 20260927121632 weekly_schedule_capacity_sunday_closed_saturday_one_team
- 20260927122747 service_addons_foundation
- 20260927131723 expand_honda_vehicle_models
- 20260927132433 configure_public_service_addons
- 20260927132525 addon_aware_public_availability
- 20260927132635 transactional_public_booking_with_addons
- 20260927132845 expose_secure_public_booking_rpc_to_service_role
- 20260927132949 fix_public_booking_addon_function_column_ambiguity
- 20260927133110 append_addons_to_public_booking_notifications
- 20260927133817 service_receipts_and_payment_settings
- 20260927154612 mandatory_completion_photo
- 20260927154635 completion_photo_operator_name
- 20260927161821 allow_owner_admin_legacy_completion_photo
- 20260927211445 vehicle_rg_photo_storage
- 20260927213644 finance_expenses
- 20260927214928 teams_up_to_two_members_and_schedule
- 20260927215401 collaborator_contact_and_notes
- 20260927220407 operational_settings_public_booking_default
- 20260928203646 aud_v2_t01_prepare_read_views
- 20260929025908 aud_v2_t01_t03_security
- 20260929034848 operator_least_privilege_daily_operation
- 20260929040103 operator_scoped_vehicle_rg_access
- 20260929041154 restore_manager_appointment_write_grants
- 20260929041512 operator_calendar_and_date_jobs
- 20260929042624 reset_all_staging_appointments_20260929
- 20260929042859 fast_manager_month_calendar_counts
- 20260929043322 prevent_duplicate_client_phone_numbers
- 20260929043423 prevent_duplicate_client_phone_numbers
- 20260929044319 completion_without_photo_with_required_reason
- 20260929045510 payment_discount_at_collection
- 20260929045843 allow_completion_photo_or_documented_exception
- 20260929051640 multi_vehicle_internal_booking
- 20260929052237 persistent_weekly_biweekly_vehicle_recurrence
- 20260929053354 fix_enrico_gls_weekly_recurrence_20260929
- 20261001133923 grant_recurring_plans_write_authenticated
- 20261001141153 cancel_appointment_with_recurring_scope
- 20261001145702 allow_completion_exception_in_legacy_photo_guard
- 20261001153215 archive_vehicle_safely
- 20261001153259 restrict_archive_vehicle_safe_rpc
- 20261001154010 restrict_operator_financial_reads
- 20261001234452 access_profiles_owner_manager_collaborator
- 20261001235830 allow_completed_payment_discount
- 20261002000434 apply_pending_discount
- 20261002001426 apply_pending_group_discount
- 20261004135946 fix_payment_discount_authorization_p0
- 20261004173141 harden_complete_job_without_photo_execute
- 20261004173212 harden_create_multi_vehicle_booking_execute
- 20261004173244 harden_create_multi_vehicle_booking_recurring_execute
- 20261004173342 harden_get_available_slots_execute
- 20261004173426 harden_get_multi_vehicle_slots_execute
- 20261004173459 harden_manager_month_counts_execute
- 20261004173538 harden_operator_complete_job_execute
- 20261004173609 harden_operator_jobs_for_date_execute
- 20261004173653 harden_operator_month_counts_execute
- 20261004173731 harden_operator_start_job_execute
- 20261004173804 harden_operator_today_jobs_execute
- 20261004173841 harden_sync_recurring_appointments_execute
- 20261004174118 harden_normalize_client_phone_search_path
- 20261004174150 harden_normalize_br_phone_search_path
- 20261004174928 fix_apply_pending_discount_null_role_authorization
- 20261004175111 fix_apply_pending_group_discount_null_role_authorization
- 20261004175216 harden_remaining_security_definer_role_guards

## Estado de segurança

A auditoria pré-produção corrigiu o P0 de autorização em `public.confirm_payment_with_discount` e aplicou hardening de EXECUTE/search_path/guards de papel nas migrations finais acima. O aviso de proteção contra senhas vazadas permanece como risco conhecido por limitação do plano. Os avisos genéricos de SECURITY DEFINER para authenticated foram revisados como uso intencional das RPCs do aplicativo.

## Regra de recuperação

Este checkpoint identifica o estado real observado do V2 e deve ser usado em conjunto com o histórico de migrations do próprio projeto Supabase. Antes de qualquer restauração/recriação, obter um dump/baseline SQL confiável por ferramenta oficial; não converter esta lista em SQL por inferência.
