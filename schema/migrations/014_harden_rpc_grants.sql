-- ============================================================================
-- Migration 014: Harden privileged RPC grants
-- ============================================================================
-- Moves privileged SECURITY DEFINER RPCs off the broad `authenticated` role
-- and onto `service_role`, matching the server-admin client introduced in
-- the app layer. This is intended for existing databases; historical
-- migrations remain immutable and this file applies the delta only.

revoke execute on function public.create_reservation_auto(bigint, bigint, public.reservation_source, bigint, timestamptz, integer, integer, text, text, text) from authenticated;
grant execute on function public.create_reservation_auto(bigint, bigint, public.reservation_source, bigint, timestamptz, integer, integer, text, text, text) to service_role;

revoke execute on function public.get_or_create_customer(text, text, text) from authenticated;
grant execute on function public.get_or_create_customer(text, text, text) to service_role;

revoke execute on function public.get_available_tables(bigint, bigint, timestamptz, timestamptz, integer, text) from authenticated;
grant execute on function public.get_available_tables(bigint, bigint, timestamptz, timestamptz, integer, text) to service_role;

revoke execute on function public.get_available_single_table_matches(bigint, bigint, timestamptz, timestamptz, integer, text) from authenticated;
grant execute on function public.get_available_single_table_matches(bigint, bigint, timestamptz, timestamptz, integer, text) to service_role;

revoke execute on function public.find_best_table_combination(bigint, bigint, timestamptz, timestamptz, integer, text) from authenticated;
grant execute on function public.find_best_table_combination(bigint, bigint, timestamptz, timestamptz, integer, text) to service_role;

revoke execute on function public.get_overflow_reservations(bigint) from authenticated;
grant execute on function public.get_overflow_reservations(bigint) to service_role;

revoke execute on function public.get_reallocation_options(bigint, integer, integer) from authenticated;
grant execute on function public.get_reallocation_options(bigint, integer, integer) to service_role;

revoke execute on function public.reassign_reservation(bigint, bigint, bigint[], timestamptz, boolean, text) from authenticated;
grant execute on function public.reassign_reservation(bigint, bigint, bigint[], timestamptz, boolean, text) to service_role;

revoke execute on function public.cancel_reservation(bigint, text) from authenticated;
grant execute on function public.cancel_reservation(bigint, text) to service_role;

revoke execute on function public.mark_reservation_completed(bigint) from authenticated;
grant execute on function public.mark_reservation_completed(bigint) to service_role;

revoke execute on function public.mark_reservation_no_show(bigint) from authenticated;
grant execute on function public.mark_reservation_no_show(bigint) to service_role;

revoke execute on function public.mark_confirmation_email_sent(bigint, text) from authenticated;
grant execute on function public.mark_confirmation_email_sent(bigint, text) to service_role;

revoke execute on function public.create_venue_with_setup(text, text, text, text, boolean, boolean, boolean, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean, boolean) from authenticated;
grant execute on function public.create_venue_with_setup(text, text, text, text, boolean, boolean, boolean, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean, boolean) to service_role;

revoke execute on function public.assign_user_role(uuid, public.app_role) from authenticated;
grant execute on function public.assign_user_role(uuid, public.app_role) to service_role;

revoke execute on function public.assign_user_to_venue(uuid, bigint) from authenticated;
grant execute on function public.assign_user_to_venue(uuid, bigint) to service_role;

revoke execute on function public.reorder_group_members(bigint, bigint[]) from authenticated;
grant execute on function public.reorder_group_members(bigint, bigint[]) to service_role;

revoke execute on function public.revert_reservation_cancellation(bigint) from authenticated;
grant execute on function public.revert_reservation_cancellation(bigint) to service_role;

revoke execute on function public.update_reservation_fields(bigint, text, text, text, integer, text, text, timestamptz, timestamptz) from authenticated;
grant execute on function public.update_reservation_fields(bigint, text, text, text, integer, text, text, timestamptz, timestamptz) to service_role;

revoke execute on function public.get_free_time_slots_for_venue(bigint, timestamptz, timestamptz, interval) from authenticated;
grant execute on function public.get_free_time_slots_for_venue(bigint, timestamptz, timestamptz, interval) to service_role;

revoke execute on function public.get_reservation_stats(date, date, bigint) from authenticated;
grant execute on function public.get_reservation_stats(date, date, bigint) to service_role;

revoke execute on function public.get_source_stats(date, date, bigint) from authenticated;
grant execute on function public.get_source_stats(date, date, bigint) to service_role;

revoke execute on function public.get_venue_stats(date, date) from authenticated;
grant execute on function public.get_venue_stats(date, date) to service_role;

revoke execute on function public.get_customer_list(text, integer, integer) from authenticated;
grant execute on function public.get_customer_list(text, integer, integer) to service_role;

revoke execute on function public.get_customer_count(text) from authenticated;
grant execute on function public.get_customer_count(text) to service_role;

revoke execute on function public.emit_reservation_outbox(bigint, public.integration_event_type) from authenticated;
grant execute on function public.emit_reservation_outbox(bigint, public.integration_event_type) to service_role;

revoke execute on function public.claim_outbox_batch(text, integer) from authenticated;
grant execute on function public.claim_outbox_batch(text, integer) to service_role;

revoke execute on function public.mark_outbox_delivered(bigint) from authenticated;
grant execute on function public.mark_outbox_delivered(bigint) to service_role;

revoke execute on function public.mark_outbox_failed(bigint, text, timestamptz) from authenticated;
grant execute on function public.mark_outbox_failed(bigint, text, timestamptz) to service_role;

revoke execute on function public.retry_outbox_event(bigint) from authenticated;
grant execute on function public.retry_outbox_event(bigint) to service_role;

revoke execute on function public.get_outbox_summary(bigint) from authenticated;
grant execute on function public.get_outbox_summary(bigint) to service_role;
