/* This file is generated from the checked deployment topology. */
export const observabilityOperationIds = Object.freeze([
  'access.accept-workforce-invitation.v1',
  'access.begin-mfa-enrollment.v1',
  'access.bootstrap-owner.v2',
  'access.complete-mfa-challenge.v1',
  'access.confirm-mfa-enrollment.v1',
  'access.get-workforce-member.v1',
  'access.grant-workforce-access.v1',
  'access.issue-workforce-invitation.v1',
  'access.list-active-business-locations.v1',
  'access.list-active-production-locations.v1',
  'access.list-effective-access-grants.v1',
  'access.list-identity-sessions.v1',
  'access.list-workforce-invitations.v1',
  'access.list-workforce-member-sessions.v1',
  'access.list-workforce-security-events.v1',
  'access.list-workforce.v1',
  'access.load-session.v1',
  'access.login.v1',
  'access.preview-workforce-invitation.v1',
  'access.reconcile-production-location.v1',
  'access.regenerate-mfa-recovery-codes.v1',
  'access.reissue-workforce-invitation.v1',
  'access.remove-mfa.v1',
  'access.resolve-location-ancestry.v1',
  'access.resolve-production-visibility.v1',
  'access.revoke-identity-sessions.v1',
  'access.revoke-session.v1',
  'access.revoke-workforce-access.v1',
  'access.revoke-workforce-invitation.v1',
  'access.revoke-workforce-member-sessions.v1',
  'access.transition-workforce-membership.v1',
  'control.accept-existing-invitation-mfa.v1',
  'control.accept-existing-invitation-password.v1',
  'control.accept-existing-invitation.v1',
  'control.accept-new-invitation.v1',
  'control.auth-login.v1',
  'control.begin-mfa-enrollment.v1',
  'control.cli-auth-api-begin-mfa-enrollment.v1',
  'control.cli-auth-api-complete-mfa-challenge.v1',
  'control.cli-auth-api-confirm-mfa-enrollment.v1',
  'control.cli-auth-api-load-session.v1',
  'control.cli-auth-api-login.v1',
  'control.cli-auth-api-logout.v1',
  'control.cli-auth-api-regenerate-mfa-recovery-codes.v1',
  'control.cli-auth-api-remove-mfa.v1',
  'control.cli-auth-login.v1',
  'control.cli-auth-logout.v1',
  'control.cli-auth-mfa-confirm.v1',
  'control.cli-auth-mfa-enroll.v1',
  'control.cli-auth-mfa-recovery-codes.v1',
  'control.cli-auth-mfa-remove.v1',
  'control.cli-auth-session.v1',
  'control.cli-bootstrap-production.v2',
  'control.cli-pricing-plan.v1',
  'control.cli-pricing-publish.v1',
  'control.cli-pricing-show.v1',
  'control.complete-mfa-challenge.v1',
  'control.confirm-mfa-enrollment.v1',
  'control.correct-order.v1',
  'control.create-customer.v1',
  'control.create-order.v1',
  'control.end-membership.v1',
  'control.get-customer.v1',
  'control.get-member.v1',
  'control.get-order.v1',
  'control.grant-access.v1',
  'control.issue-invitation.v1',
  'control.list-customers.v1',
  'control.list-identity-sessions.v1',
  'control.list-invitations.v1',
  'control.list-member-sessions.v1',
  'control.list-members.v1',
  'control.list-orders.v1',
  'control.list-security-events.v1',
  'control.load-auth-session.v1',
  'control.logout.v1',
  'control.preview-invitation.v1',
  'control.reactivate-membership.v1',
  'control.regenerate-mfa-recovery-codes.v1',
  'control.reissue-invitation.v1',
  'control.remove-mfa.v1',
  'control.resolve-access.v1',
  'control.revoke-access.v1',
  'control.revoke-all-identity-sessions.v1',
  'control.revoke-identity-session.v1',
  'control.revoke-invitation.v1',
  'control.revoke-member-sessions.v1',
  'control.suspend-membership.v1',
  'control.update-customer.v1',
  'customer.auth-login.v1',
  'customer.begin-mfa-enrollment.v1',
  'customer.complete-mfa-challenge.v1',
  'customer.confirm-mfa-enrollment.v1',
  'customer.list-identity-sessions.v1',
  'customer.load-auth-session.v1',
  'customer.logout.v1',
  'customer.regenerate-mfa-recovery-codes.v1',
  'customer.remove-mfa.v1',
  'customer.revoke-all-identity-sessions.v1',
  'customer.revoke-identity-session.v1',
  'customers.create-customer.v1',
  'customers.get-customer.v1',
  'customers.list-customers.v1',
  'customers.resolve-exact-source-customer.v1',
  'customers.update-customer.v1',
  'ingress.capture-webhook-receipt.v1',
  'ingress.claim-events.v1',
  'ingress.complete-event.v1',
  'ingress.dead-letter-event.v1',
  'ingress.ingest-event.v1',
  'ingress.link-webhook-receipt.v1',
  'ingress.list-dead-events.v1',
  'ingress.measure-webhook-backlog.v1',
  'ingress.process-inbound-event.v1',
  'ingress.purge-expired-webhook-receipts.v1',
  'ingress.receive-cents-webhook.v1',
  'ingress.reconcile-source-location-bindings.v1',
  'ingress.replay-dead-event.v1',
  'ingress.resolve-source-location.v1',
  'ingress.retry-event.v1',
  'orders.accept-incoming-order-proposal.v1',
  'orders.cancel-order.v1',
  'orders.claim-order-outbox.v1',
  'orders.close-incoming-order-source.v1',
  'orders.complete-order-outbox.v1',
  'orders.complete-order.v1',
  'orders.correct-order.v1',
  'orders.create-order.v1',
  'orders.dead-letter-order-outbox.v1',
  'orders.get-canonical-order.v1',
  'orders.list-canonical-orders.v1',
  'orders.list-incoming-order-proposals.v1',
  'orders.measure-order-outbox-backlog.v1',
  'orders.propose-incoming-order.v1',
  'orders.reject-incoming-order-proposal.v1',
  'orders.release-fulfillment.v1',
  'orders.restore-incoming-order-proposal.v1',
  'orders.retry-order-outbox.v1',
  'orders.withdraw-fulfillment.v1',
  'pricing.load-pricing-catalog.v1',
  'pricing.plan-pricing-change.v1',
  'pricing.publish-pricing-change.v1',
  'processor.auth-login.v1',
  'processor.complete-mfa-challenge.v1',
  'processor.list-production-history-activity.v1',
  'processor.list-production-order-control.v1',
  'processor.load-auth-session.v1',
  'processor.load-production-board.v1',
  'processor.load-production-history-run.v1',
  'processor.load-production-workspace.v1',
  'processor.load-remaining-day-forecast.v1',
  'processor.logout.v1',
  'processor.preview-production-order-backlog.v1',
  'processor.resolve-access.v1',
  'production.accept-schedule.v1',
  'production.advance-stage.v1',
  'production.apply-fulfillment-demand.v1',
  'production.assign-stage-machines.v1',
  'production.attempt-automatic-placement.v1',
  'production.change-admission.v1',
  'production.change-order-resolution.v1',
  'production.commit-order-backlog.v1',
  'production.commit-order-route.v1',
  'production.confirm-order-overtime.v1',
  'production.create-schedule.v1',
  'production.create-shift.v1',
  'production.freeze-batch-membership.v1',
  'production.list-history-activity.v1',
  'production.list-history-plans.v1',
  'production.list-history-runs.v1',
  'production.list-locations.v1',
  'production.list-order-control.v1',
  'production.list-orders.v1',
  'production.load-board.v1',
  'production.load-history-run.v1',
  'production.load-remaining-day-forecast.v1',
  'production.load-schedule.v1',
  'production.load-workspace.v1',
  'production.manage-resources.v1',
  'production.place-order-automatically.v1',
  'production.place-order-exactly.v1',
  'production.preview-order-backlog.v1',
  'production.preview-order-route.v1',
  'production.publish-scheduler-config.v1',
  'production.reconcile-batch-progress.v1',
  'production.record-order-intake.v1',
  'production.replace-shift-selection.v1',
  'production.resolve-source-closed-fulfillment.v1',
  'production.set-order-priority.v1',
  'production.start-schedule.v1',
  'production.subscribe-changes.v1',
  'production.unfreeze-batch-membership.v1',
  'production.update-shift.v1',
] as const);

export const observabilityOperationNames = Object.freeze([
  'identity.accept_workforce_invitation',
  'identity.begin_mfa_enrollment',
  'identity.bootstrap_owner',
  'identity.complete_mfa_challenge',
  'identity.confirm_mfa_enrollment',
  'identity.get_workforce_member',
  'identity.grant_workforce_access',
  'identity.issue_workforce_invitation',
  'access.list_active_business_locations',
  'access.list_active_production_locations',
  'access.list_effective_access_grants',
  'identity.list_identity_sessions',
  'identity.list_workforce_invitations',
  'identity.list_workforce_member_sessions',
  'identity.list_workforce_security_events',
  'identity.list_workforce',
  'identity.load_session',
  'identity.login',
  'identity.preview_workforce_invitation',
  'access.reconcile_production_location',
  'identity.regenerate_mfa_recovery_codes',
  'identity.reissue_workforce_invitation',
  'identity.remove_mfa',
  'authorization.resolve_location_ancestry',
  'authorization.resolve_production_visibility',
  'identity.revoke_identity_sessions',
  'identity.revoke_session',
  'identity.revoke_workforce_access',
  'identity.revoke_workforce_invitation',
  'identity.revoke_workforce_member_sessions',
  'identity.transition_workforce_membership',
  'control.accept_existing_invitation_mfa',
  'control.accept_existing_invitation_password',
  'control.accept_existing_invitation',
  'control.accept_new_invitation',
  'control.authentication.login',
  'control.authentication.begin_mfa_enrollment',
  'control.cli_auth_api.begin_mfa_enrollment',
  'control.cli_auth_api.complete_mfa_challenge',
  'control.cli_auth_api.confirm_mfa_enrollment',
  'control.cli_auth_api.load_session',
  'control.cli_auth_api.auth_login',
  'control.cli_auth_api.logout',
  'control.cli_auth_api.regenerate_mfa_recovery_codes',
  'control.cli_auth_api.remove_mfa',
  'control.cli.auth_login',
  'control.cli.auth_logout',
  'control.cli.auth_mfa_confirm',
  'control.cli.auth_mfa_enroll',
  'control.cli.auth_mfa_recovery_codes',
  'control.cli.auth_mfa_remove',
  'control.cli.auth_session',
  'control.cli.bootstrap_production_v2',
  'control.cli.pricing_plan',
  'control.cli.pricing_publish',
  'control.cli.pricing_show',
  'control.authentication.complete_mfa_challenge',
  'control.authentication.confirm_mfa_enrollment',
  'control.correct_order',
  'control.create_customer',
  'control.create_order',
  'control_end-membership_v1',
  'control.get_customer',
  'control.get_member',
  'control.get_order',
  'control.grant_access',
  'control.issue_invitation',
  'control.list_customers',
  'control.authentication.list_identity_sessions',
  'control.list_invitations',
  'control.list_member_sessions',
  'control.list_members',
  'control.list_orders',
  'control.list_security_events',
  'control.authentication.load_session',
  'control.authentication.logout',
  'control.preview_invitation',
  'control_reactivate-membership_v1',
  'control.authentication.regenerate_mfa_recovery_codes',
  'control.reissue_invitation',
  'control.authentication.remove_mfa',
  'control.resolve_access',
  'control.revoke_access',
  'control.authentication.revoke_all_identity_sessions',
  'control.authentication.revoke_identity_session',
  'control.revoke_invitation',
  'control.revoke_member_sessions',
  'control_suspend-membership_v1',
  'control.update_customer',
  'customer.authentication.login',
  'customer.authentication.begin_mfa_enrollment',
  'customer.authentication.complete_mfa_challenge',
  'customer.authentication.confirm_mfa_enrollment',
  'customer.authentication.list_identity_sessions',
  'customer.authentication.load_session',
  'customer.authentication.logout',
  'customer.authentication.regenerate_mfa_recovery_codes',
  'customer.authentication.remove_mfa',
  'customer.authentication.revoke_all_identity_sessions',
  'customer.authentication.revoke_identity_session',
  'customers.create_customer',
  'customers.get_customer',
  'customers.list_customers',
  'customers.resolve_exact_source_customer',
  'customers.update_customer',
  'ingress.capture_webhook_receipt',
  'ingress.claim_events',
  'ingress.complete_event',
  'ingress.dead_letter_event',
  'ingress.ingest_event',
  'ingress.link_webhook_receipt',
  'ingress.list_dead_events',
  'ingress.measure_webhook_backlog',
  'ingress.process_inbound_event',
  'ingress.purge_expired_webhook_receipts',
  'ingress.receive_cents_webhook',
  'ingress.reconcile_source_location_bindings',
  'ingress.replay_dead_event',
  'ingress.resolve_source_location',
  'ingress.retry_event',
  'orders.accept_incoming_order_proposal',
  'orders.cancel_order',
  'orders.claim_order_outbox',
  'orders.close_incoming_order_source',
  'orders.complete_order_outbox',
  'orders.complete_order',
  'orders.correct_order',
  'orders.create_order',
  'orders.dead_letter_order_outbox',
  'orders.get_canonical_order',
  'orders.list_canonical_orders',
  'orders.list_incoming_order_proposals',
  'orders.measure_order_outbox_backlog',
  'orders.propose_incoming_order',
  'orders.reject_incoming_order_proposal',
  'orders.release_fulfillment',
  'orders.restore_incoming_order_proposal',
  'orders.retry_order_outbox',
  'orders.withdraw_fulfillment',
  'pricing.load_pricing_catalog',
  'pricing.plan_pricing_change',
  'pricing.publish_pricing_change',
  'processor.authentication.login',
  'processor.authentication.complete_mfa_challenge',
  'processor.list_production_history_activity',
  'processor.list_production_order_control',
  'processor.authentication.load_session',
  'processor.load_production_board',
  'processor.load_production_history_run',
  'processor.load_production_workspace',
  'processor.load_remaining_day_forecast',
  'processor.authentication.logout',
  'processor.preview_production_order_backlog',
  'processor.resolve_access',
  'production.accept_schedule',
  'production.advance_stage',
  'production.apply_fulfillment_demand',
  'production.assign_stage_machines',
  'production.attempt_automatic_placement',
  'production.change_admission',
  'production.change_order_resolution',
  'production.commit_order_backlog',
  'production.commit_order_route',
  'production.confirm_order_overtime',
  'production.create_schedule',
  'production.create_shift',
  'production.freeze_batch_membership',
  'production.list_history_activity',
  'production.list_history_plans',
  'production.list_history_runs',
  'production.list_locations',
  'production.list_order_control',
  'production.list_orders',
  'production.load_board',
  'production.load_history_run',
  'production.load_remaining_day_forecast',
  'production.load_schedule',
  'production.load_workspace',
  'production.manage_resources',
  'production.place_order_automatically',
  'production.place_order_exactly',
  'production.preview_order_backlog',
  'production.preview_order_route',
  'production.publish_scheduler_config',
  'production.reconcile_batch_progress',
  'production.record_order_intake',
  'production.replace_shift_selection',
  'production.resolve_source_closed_fulfillment',
  'production.set_order_priority',
  'production.start_schedule',
  'production.subscribe_changes',
  'production.unfreeze_batch_membership',
  'production.update_shift',
] as const);

export const observabilityRuntimeValues = Object.freeze([
  'api',
  'worker',
  'web',
  'processor',
  'control',
] as const);

export const observabilityOperationIdByName = Object.freeze({
  'identity.accept_workforce_invitation':
    'access.accept-workforce-invitation.v1',
  'identity.begin_mfa_enrollment': 'access.begin-mfa-enrollment.v1',
  'identity.bootstrap_owner': 'access.bootstrap-owner.v2',
  'identity.complete_mfa_challenge': 'access.complete-mfa-challenge.v1',
  'identity.confirm_mfa_enrollment': 'access.confirm-mfa-enrollment.v1',
  'identity.get_workforce_member': 'access.get-workforce-member.v1',
  'identity.grant_workforce_access': 'access.grant-workforce-access.v1',
  'identity.issue_workforce_invitation': 'access.issue-workforce-invitation.v1',
  'access.list_active_business_locations':
    'access.list-active-business-locations.v1',
  'access.list_active_production_locations':
    'access.list-active-production-locations.v1',
  'access.list_effective_access_grants':
    'access.list-effective-access-grants.v1',
  'identity.list_identity_sessions': 'access.list-identity-sessions.v1',
  'identity.list_workforce_invitations': 'access.list-workforce-invitations.v1',
  'identity.list_workforce_member_sessions':
    'access.list-workforce-member-sessions.v1',
  'identity.list_workforce_security_events':
    'access.list-workforce-security-events.v1',
  'identity.list_workforce': 'access.list-workforce.v1',
  'identity.load_session': 'access.load-session.v1',
  'identity.login': 'access.login.v1',
  'identity.preview_workforce_invitation':
    'access.preview-workforce-invitation.v1',
  'access.reconcile_production_location':
    'access.reconcile-production-location.v1',
  'identity.regenerate_mfa_recovery_codes':
    'access.regenerate-mfa-recovery-codes.v1',
  'identity.reissue_workforce_invitation':
    'access.reissue-workforce-invitation.v1',
  'identity.remove_mfa': 'access.remove-mfa.v1',
  'authorization.resolve_location_ancestry':
    'access.resolve-location-ancestry.v1',
  'authorization.resolve_production_visibility':
    'access.resolve-production-visibility.v1',
  'identity.revoke_identity_sessions': 'access.revoke-identity-sessions.v1',
  'identity.revoke_session': 'access.revoke-session.v1',
  'identity.revoke_workforce_access': 'access.revoke-workforce-access.v1',
  'identity.revoke_workforce_invitation':
    'access.revoke-workforce-invitation.v1',
  'identity.revoke_workforce_member_sessions':
    'access.revoke-workforce-member-sessions.v1',
  'identity.transition_workforce_membership':
    'access.transition-workforce-membership.v1',
  'control.accept_existing_invitation_mfa':
    'control.accept-existing-invitation-mfa.v1',
  'control.accept_existing_invitation_password':
    'control.accept-existing-invitation-password.v1',
  'control.accept_existing_invitation': 'control.accept-existing-invitation.v1',
  'control.accept_new_invitation': 'control.accept-new-invitation.v1',
  'control.authentication.login': 'control.auth-login.v1',
  'control.authentication.begin_mfa_enrollment':
    'control.begin-mfa-enrollment.v1',
  'control.cli_auth_api.begin_mfa_enrollment':
    'control.cli-auth-api-begin-mfa-enrollment.v1',
  'control.cli_auth_api.complete_mfa_challenge':
    'control.cli-auth-api-complete-mfa-challenge.v1',
  'control.cli_auth_api.confirm_mfa_enrollment':
    'control.cli-auth-api-confirm-mfa-enrollment.v1',
  'control.cli_auth_api.load_session': 'control.cli-auth-api-load-session.v1',
  'control.cli_auth_api.auth_login': 'control.cli-auth-api-login.v1',
  'control.cli_auth_api.logout': 'control.cli-auth-api-logout.v1',
  'control.cli_auth_api.regenerate_mfa_recovery_codes':
    'control.cli-auth-api-regenerate-mfa-recovery-codes.v1',
  'control.cli_auth_api.remove_mfa': 'control.cli-auth-api-remove-mfa.v1',
  'control.cli.auth_login': 'control.cli-auth-login.v1',
  'control.cli.auth_logout': 'control.cli-auth-logout.v1',
  'control.cli.auth_mfa_confirm': 'control.cli-auth-mfa-confirm.v1',
  'control.cli.auth_mfa_enroll': 'control.cli-auth-mfa-enroll.v1',
  'control.cli.auth_mfa_recovery_codes':
    'control.cli-auth-mfa-recovery-codes.v1',
  'control.cli.auth_mfa_remove': 'control.cli-auth-mfa-remove.v1',
  'control.cli.auth_session': 'control.cli-auth-session.v1',
  'control.cli.bootstrap_production_v2': 'control.cli-bootstrap-production.v2',
  'control.cli.pricing_plan': 'control.cli-pricing-plan.v1',
  'control.cli.pricing_publish': 'control.cli-pricing-publish.v1',
  'control.cli.pricing_show': 'control.cli-pricing-show.v1',
  'control.authentication.complete_mfa_challenge':
    'control.complete-mfa-challenge.v1',
  'control.authentication.confirm_mfa_enrollment':
    'control.confirm-mfa-enrollment.v1',
  'control.correct_order': 'control.correct-order.v1',
  'control.create_customer': 'control.create-customer.v1',
  'control.create_order': 'control.create-order.v1',
  'control_end-membership_v1': 'control.end-membership.v1',
  'control.get_customer': 'control.get-customer.v1',
  'control.get_member': 'control.get-member.v1',
  'control.get_order': 'control.get-order.v1',
  'control.grant_access': 'control.grant-access.v1',
  'control.issue_invitation': 'control.issue-invitation.v1',
  'control.list_customers': 'control.list-customers.v1',
  'control.authentication.list_identity_sessions':
    'control.list-identity-sessions.v1',
  'control.list_invitations': 'control.list-invitations.v1',
  'control.list_member_sessions': 'control.list-member-sessions.v1',
  'control.list_members': 'control.list-members.v1',
  'control.list_orders': 'control.list-orders.v1',
  'control.list_security_events': 'control.list-security-events.v1',
  'control.authentication.load_session': 'control.load-auth-session.v1',
  'control.authentication.logout': 'control.logout.v1',
  'control.preview_invitation': 'control.preview-invitation.v1',
  'control_reactivate-membership_v1': 'control.reactivate-membership.v1',
  'control.authentication.regenerate_mfa_recovery_codes':
    'control.regenerate-mfa-recovery-codes.v1',
  'control.reissue_invitation': 'control.reissue-invitation.v1',
  'control.authentication.remove_mfa': 'control.remove-mfa.v1',
  'control.resolve_access': 'control.resolve-access.v1',
  'control.revoke_access': 'control.revoke-access.v1',
  'control.authentication.revoke_all_identity_sessions':
    'control.revoke-all-identity-sessions.v1',
  'control.authentication.revoke_identity_session':
    'control.revoke-identity-session.v1',
  'control.revoke_invitation': 'control.revoke-invitation.v1',
  'control.revoke_member_sessions': 'control.revoke-member-sessions.v1',
  'control_suspend-membership_v1': 'control.suspend-membership.v1',
  'control.update_customer': 'control.update-customer.v1',
  'customer.authentication.login': 'customer.auth-login.v1',
  'customer.authentication.begin_mfa_enrollment':
    'customer.begin-mfa-enrollment.v1',
  'customer.authentication.complete_mfa_challenge':
    'customer.complete-mfa-challenge.v1',
  'customer.authentication.confirm_mfa_enrollment':
    'customer.confirm-mfa-enrollment.v1',
  'customer.authentication.list_identity_sessions':
    'customer.list-identity-sessions.v1',
  'customer.authentication.load_session': 'customer.load-auth-session.v1',
  'customer.authentication.logout': 'customer.logout.v1',
  'customer.authentication.regenerate_mfa_recovery_codes':
    'customer.regenerate-mfa-recovery-codes.v1',
  'customer.authentication.remove_mfa': 'customer.remove-mfa.v1',
  'customer.authentication.revoke_all_identity_sessions':
    'customer.revoke-all-identity-sessions.v1',
  'customer.authentication.revoke_identity_session':
    'customer.revoke-identity-session.v1',
  'customers.create_customer': 'customers.create-customer.v1',
  'customers.get_customer': 'customers.get-customer.v1',
  'customers.list_customers': 'customers.list-customers.v1',
  'customers.resolve_exact_source_customer':
    'customers.resolve-exact-source-customer.v1',
  'customers.update_customer': 'customers.update-customer.v1',
  'ingress.capture_webhook_receipt': 'ingress.capture-webhook-receipt.v1',
  'ingress.claim_events': 'ingress.claim-events.v1',
  'ingress.complete_event': 'ingress.complete-event.v1',
  'ingress.dead_letter_event': 'ingress.dead-letter-event.v1',
  'ingress.ingest_event': 'ingress.ingest-event.v1',
  'ingress.link_webhook_receipt': 'ingress.link-webhook-receipt.v1',
  'ingress.list_dead_events': 'ingress.list-dead-events.v1',
  'ingress.measure_webhook_backlog': 'ingress.measure-webhook-backlog.v1',
  'ingress.process_inbound_event': 'ingress.process-inbound-event.v1',
  'ingress.purge_expired_webhook_receipts':
    'ingress.purge-expired-webhook-receipts.v1',
  'ingress.receive_cents_webhook': 'ingress.receive-cents-webhook.v1',
  'ingress.reconcile_source_location_bindings':
    'ingress.reconcile-source-location-bindings.v1',
  'ingress.replay_dead_event': 'ingress.replay-dead-event.v1',
  'ingress.resolve_source_location': 'ingress.resolve-source-location.v1',
  'ingress.retry_event': 'ingress.retry-event.v1',
  'orders.accept_incoming_order_proposal':
    'orders.accept-incoming-order-proposal.v1',
  'orders.cancel_order': 'orders.cancel-order.v1',
  'orders.claim_order_outbox': 'orders.claim-order-outbox.v1',
  'orders.close_incoming_order_source': 'orders.close-incoming-order-source.v1',
  'orders.complete_order_outbox': 'orders.complete-order-outbox.v1',
  'orders.complete_order': 'orders.complete-order.v1',
  'orders.correct_order': 'orders.correct-order.v1',
  'orders.create_order': 'orders.create-order.v1',
  'orders.dead_letter_order_outbox': 'orders.dead-letter-order-outbox.v1',
  'orders.get_canonical_order': 'orders.get-canonical-order.v1',
  'orders.list_canonical_orders': 'orders.list-canonical-orders.v1',
  'orders.list_incoming_order_proposals':
    'orders.list-incoming-order-proposals.v1',
  'orders.measure_order_outbox_backlog':
    'orders.measure-order-outbox-backlog.v1',
  'orders.propose_incoming_order': 'orders.propose-incoming-order.v1',
  'orders.reject_incoming_order_proposal':
    'orders.reject-incoming-order-proposal.v1',
  'orders.release_fulfillment': 'orders.release-fulfillment.v1',
  'orders.restore_incoming_order_proposal':
    'orders.restore-incoming-order-proposal.v1',
  'orders.retry_order_outbox': 'orders.retry-order-outbox.v1',
  'orders.withdraw_fulfillment': 'orders.withdraw-fulfillment.v1',
  'pricing.load_pricing_catalog': 'pricing.load-pricing-catalog.v1',
  'pricing.plan_pricing_change': 'pricing.plan-pricing-change.v1',
  'pricing.publish_pricing_change': 'pricing.publish-pricing-change.v1',
  'processor.authentication.login': 'processor.auth-login.v1',
  'processor.authentication.complete_mfa_challenge':
    'processor.complete-mfa-challenge.v1',
  'processor.list_production_history_activity':
    'processor.list-production-history-activity.v1',
  'processor.list_production_order_control':
    'processor.list-production-order-control.v1',
  'processor.authentication.load_session': 'processor.load-auth-session.v1',
  'processor.load_production_board': 'processor.load-production-board.v1',
  'processor.load_production_history_run':
    'processor.load-production-history-run.v1',
  'processor.load_production_workspace':
    'processor.load-production-workspace.v1',
  'processor.load_remaining_day_forecast':
    'processor.load-remaining-day-forecast.v1',
  'processor.authentication.logout': 'processor.logout.v1',
  'processor.preview_production_order_backlog':
    'processor.preview-production-order-backlog.v1',
  'processor.resolve_access': 'processor.resolve-access.v1',
  'production.accept_schedule': 'production.accept-schedule.v1',
  'production.advance_stage': 'production.advance-stage.v1',
  'production.apply_fulfillment_demand':
    'production.apply-fulfillment-demand.v1',
  'production.assign_stage_machines': 'production.assign-stage-machines.v1',
  'production.attempt_automatic_placement':
    'production.attempt-automatic-placement.v1',
  'production.change_admission': 'production.change-admission.v1',
  'production.change_order_resolution': 'production.change-order-resolution.v1',
  'production.commit_order_backlog': 'production.commit-order-backlog.v1',
  'production.commit_order_route': 'production.commit-order-route.v1',
  'production.confirm_order_overtime': 'production.confirm-order-overtime.v1',
  'production.create_schedule': 'production.create-schedule.v1',
  'production.create_shift': 'production.create-shift.v1',
  'production.freeze_batch_membership': 'production.freeze-batch-membership.v1',
  'production.list_history_activity': 'production.list-history-activity.v1',
  'production.list_history_plans': 'production.list-history-plans.v1',
  'production.list_history_runs': 'production.list-history-runs.v1',
  'production.list_locations': 'production.list-locations.v1',
  'production.list_order_control': 'production.list-order-control.v1',
  'production.list_orders': 'production.list-orders.v1',
  'production.load_board': 'production.load-board.v1',
  'production.load_history_run': 'production.load-history-run.v1',
  'production.load_remaining_day_forecast':
    'production.load-remaining-day-forecast.v1',
  'production.load_schedule': 'production.load-schedule.v1',
  'production.load_workspace': 'production.load-workspace.v1',
  'production.manage_resources': 'production.manage-resources.v1',
  'production.place_order_automatically':
    'production.place-order-automatically.v1',
  'production.place_order_exactly': 'production.place-order-exactly.v1',
  'production.preview_order_backlog': 'production.preview-order-backlog.v1',
  'production.preview_order_route': 'production.preview-order-route.v1',
  'production.publish_scheduler_config':
    'production.publish-scheduler-config.v1',
  'production.reconcile_batch_progress':
    'production.reconcile-batch-progress.v1',
  'production.record_order_intake': 'production.record-order-intake.v1',
  'production.replace_shift_selection': 'production.replace-shift-selection.v1',
  'production.resolve_source_closed_fulfillment':
    'production.resolve-source-closed-fulfillment.v1',
  'production.set_order_priority': 'production.set-order-priority.v1',
  'production.start_schedule': 'production.start-schedule.v1',
  'production.subscribe_changes': 'production.subscribe-changes.v1',
  'production.unfreeze_batch_membership':
    'production.unfreeze-batch-membership.v1',
  'production.update_shift': 'production.update-shift.v1',
} as const);

export const observabilityOperationsById = Object.freeze({
  'access.accept-workforce-invitation.v1': {
    operation: 'identity.accept_workforce_invitation',
  },
  'access.begin-mfa-enrollment.v1': {
    operation: 'identity.begin_mfa_enrollment',
  },
  'access.bootstrap-owner.v2': {
    operation: 'identity.bootstrap_owner',
  },
  'access.complete-mfa-challenge.v1': {
    operation: 'identity.complete_mfa_challenge',
  },
  'access.confirm-mfa-enrollment.v1': {
    operation: 'identity.confirm_mfa_enrollment',
  },
  'access.get-workforce-member.v1': {
    operation: 'identity.get_workforce_member',
  },
  'access.grant-workforce-access.v1': {
    operation: 'identity.grant_workforce_access',
  },
  'access.issue-workforce-invitation.v1': {
    operation: 'identity.issue_workforce_invitation',
  },
  'access.list-active-business-locations.v1': {
    operation: 'access.list_active_business_locations',
  },
  'access.list-active-production-locations.v1': {
    operation: 'access.list_active_production_locations',
  },
  'access.list-effective-access-grants.v1': {
    operation: 'access.list_effective_access_grants',
  },
  'access.list-identity-sessions.v1': {
    operation: 'identity.list_identity_sessions',
  },
  'access.list-workforce-invitations.v1': {
    operation: 'identity.list_workforce_invitations',
  },
  'access.list-workforce-member-sessions.v1': {
    operation: 'identity.list_workforce_member_sessions',
  },
  'access.list-workforce-security-events.v1': {
    operation: 'identity.list_workforce_security_events',
  },
  'access.list-workforce.v1': {
    operation: 'identity.list_workforce',
  },
  'access.load-session.v1': {
    operation: 'identity.load_session',
  },
  'access.login.v1': {
    operation: 'identity.login',
  },
  'access.preview-workforce-invitation.v1': {
    operation: 'identity.preview_workforce_invitation',
  },
  'access.reconcile-production-location.v1': {
    operation: 'access.reconcile_production_location',
  },
  'access.regenerate-mfa-recovery-codes.v1': {
    operation: 'identity.regenerate_mfa_recovery_codes',
  },
  'access.reissue-workforce-invitation.v1': {
    operation: 'identity.reissue_workforce_invitation',
  },
  'access.remove-mfa.v1': {
    operation: 'identity.remove_mfa',
  },
  'access.resolve-location-ancestry.v1': {
    operation: 'authorization.resolve_location_ancestry',
  },
  'access.resolve-production-visibility.v1': {
    operation: 'authorization.resolve_production_visibility',
  },
  'access.revoke-identity-sessions.v1': {
    operation: 'identity.revoke_identity_sessions',
  },
  'access.revoke-session.v1': {
    operation: 'identity.revoke_session',
  },
  'access.revoke-workforce-access.v1': {
    operation: 'identity.revoke_workforce_access',
  },
  'access.revoke-workforce-invitation.v1': {
    operation: 'identity.revoke_workforce_invitation',
  },
  'access.revoke-workforce-member-sessions.v1': {
    operation: 'identity.revoke_workforce_member_sessions',
  },
  'access.transition-workforce-membership.v1': {
    operation: 'identity.transition_workforce_membership',
  },
  'control.accept-existing-invitation-mfa.v1': {
    operation: 'control.accept_existing_invitation_mfa',
  },
  'control.accept-existing-invitation-password.v1': {
    operation: 'control.accept_existing_invitation_password',
  },
  'control.accept-existing-invitation.v1': {
    operation: 'control.accept_existing_invitation',
  },
  'control.accept-new-invitation.v1': {
    operation: 'control.accept_new_invitation',
  },
  'control.auth-login.v1': {
    operation: 'control.authentication.login',
  },
  'control.begin-mfa-enrollment.v1': {
    operation: 'control.authentication.begin_mfa_enrollment',
  },
  'control.cli-auth-api-begin-mfa-enrollment.v1': {
    operation: 'control.cli_auth_api.begin_mfa_enrollment',
  },
  'control.cli-auth-api-complete-mfa-challenge.v1': {
    operation: 'control.cli_auth_api.complete_mfa_challenge',
  },
  'control.cli-auth-api-confirm-mfa-enrollment.v1': {
    operation: 'control.cli_auth_api.confirm_mfa_enrollment',
  },
  'control.cli-auth-api-load-session.v1': {
    operation: 'control.cli_auth_api.load_session',
  },
  'control.cli-auth-api-login.v1': {
    operation: 'control.cli_auth_api.auth_login',
  },
  'control.cli-auth-api-logout.v1': {
    operation: 'control.cli_auth_api.logout',
  },
  'control.cli-auth-api-regenerate-mfa-recovery-codes.v1': {
    operation: 'control.cli_auth_api.regenerate_mfa_recovery_codes',
  },
  'control.cli-auth-api-remove-mfa.v1': {
    operation: 'control.cli_auth_api.remove_mfa',
  },
  'control.cli-auth-login.v1': {
    operation: 'control.cli.auth_login',
  },
  'control.cli-auth-logout.v1': {
    operation: 'control.cli.auth_logout',
  },
  'control.cli-auth-mfa-confirm.v1': {
    operation: 'control.cli.auth_mfa_confirm',
  },
  'control.cli-auth-mfa-enroll.v1': {
    operation: 'control.cli.auth_mfa_enroll',
  },
  'control.cli-auth-mfa-recovery-codes.v1': {
    operation: 'control.cli.auth_mfa_recovery_codes',
  },
  'control.cli-auth-mfa-remove.v1': {
    operation: 'control.cli.auth_mfa_remove',
  },
  'control.cli-auth-session.v1': {
    operation: 'control.cli.auth_session',
  },
  'control.cli-bootstrap-production.v2': {
    operation: 'control.cli.bootstrap_production_v2',
  },
  'control.cli-pricing-plan.v1': {
    operation: 'control.cli.pricing_plan',
  },
  'control.cli-pricing-publish.v1': {
    operation: 'control.cli.pricing_publish',
  },
  'control.cli-pricing-show.v1': {
    operation: 'control.cli.pricing_show',
  },
  'control.complete-mfa-challenge.v1': {
    operation: 'control.authentication.complete_mfa_challenge',
  },
  'control.confirm-mfa-enrollment.v1': {
    operation: 'control.authentication.confirm_mfa_enrollment',
  },
  'control.correct-order.v1': {
    operation: 'control.correct_order',
  },
  'control.create-customer.v1': {
    operation: 'control.create_customer',
  },
  'control.create-order.v1': {
    operation: 'control.create_order',
  },
  'control.end-membership.v1': {
    operation: 'control_end-membership_v1',
  },
  'control.get-customer.v1': {
    operation: 'control.get_customer',
  },
  'control.get-member.v1': {
    operation: 'control.get_member',
  },
  'control.get-order.v1': {
    operation: 'control.get_order',
  },
  'control.grant-access.v1': {
    operation: 'control.grant_access',
  },
  'control.issue-invitation.v1': {
    operation: 'control.issue_invitation',
  },
  'control.list-customers.v1': {
    operation: 'control.list_customers',
  },
  'control.list-identity-sessions.v1': {
    operation: 'control.authentication.list_identity_sessions',
  },
  'control.list-invitations.v1': {
    operation: 'control.list_invitations',
  },
  'control.list-member-sessions.v1': {
    operation: 'control.list_member_sessions',
  },
  'control.list-members.v1': {
    operation: 'control.list_members',
  },
  'control.list-orders.v1': {
    operation: 'control.list_orders',
  },
  'control.list-security-events.v1': {
    operation: 'control.list_security_events',
  },
  'control.load-auth-session.v1': {
    operation: 'control.authentication.load_session',
  },
  'control.logout.v1': {
    operation: 'control.authentication.logout',
  },
  'control.preview-invitation.v1': {
    operation: 'control.preview_invitation',
  },
  'control.reactivate-membership.v1': {
    operation: 'control_reactivate-membership_v1',
  },
  'control.regenerate-mfa-recovery-codes.v1': {
    operation: 'control.authentication.regenerate_mfa_recovery_codes',
  },
  'control.reissue-invitation.v1': {
    operation: 'control.reissue_invitation',
  },
  'control.remove-mfa.v1': {
    operation: 'control.authentication.remove_mfa',
  },
  'control.resolve-access.v1': {
    operation: 'control.resolve_access',
  },
  'control.revoke-access.v1': {
    operation: 'control.revoke_access',
  },
  'control.revoke-all-identity-sessions.v1': {
    operation: 'control.authentication.revoke_all_identity_sessions',
  },
  'control.revoke-identity-session.v1': {
    operation: 'control.authentication.revoke_identity_session',
  },
  'control.revoke-invitation.v1': {
    operation: 'control.revoke_invitation',
  },
  'control.revoke-member-sessions.v1': {
    operation: 'control.revoke_member_sessions',
  },
  'control.suspend-membership.v1': {
    operation: 'control_suspend-membership_v1',
  },
  'control.update-customer.v1': {
    operation: 'control.update_customer',
  },
  'customer.auth-login.v1': {
    operation: 'customer.authentication.login',
  },
  'customer.begin-mfa-enrollment.v1': {
    operation: 'customer.authentication.begin_mfa_enrollment',
  },
  'customer.complete-mfa-challenge.v1': {
    operation: 'customer.authentication.complete_mfa_challenge',
  },
  'customer.confirm-mfa-enrollment.v1': {
    operation: 'customer.authentication.confirm_mfa_enrollment',
  },
  'customer.list-identity-sessions.v1': {
    operation: 'customer.authentication.list_identity_sessions',
  },
  'customer.load-auth-session.v1': {
    operation: 'customer.authentication.load_session',
  },
  'customer.logout.v1': {
    operation: 'customer.authentication.logout',
  },
  'customer.regenerate-mfa-recovery-codes.v1': {
    operation: 'customer.authentication.regenerate_mfa_recovery_codes',
  },
  'customer.remove-mfa.v1': {
    operation: 'customer.authentication.remove_mfa',
  },
  'customer.revoke-all-identity-sessions.v1': {
    operation: 'customer.authentication.revoke_all_identity_sessions',
  },
  'customer.revoke-identity-session.v1': {
    operation: 'customer.authentication.revoke_identity_session',
  },
  'customers.create-customer.v1': {
    operation: 'customers.create_customer',
  },
  'customers.get-customer.v1': {
    operation: 'customers.get_customer',
  },
  'customers.list-customers.v1': {
    operation: 'customers.list_customers',
  },
  'customers.resolve-exact-source-customer.v1': {
    operation: 'customers.resolve_exact_source_customer',
  },
  'customers.update-customer.v1': {
    operation: 'customers.update_customer',
  },
  'ingress.capture-webhook-receipt.v1': {
    operation: 'ingress.capture_webhook_receipt',
  },
  'ingress.claim-events.v1': {
    operation: 'ingress.claim_events',
  },
  'ingress.complete-event.v1': {
    operation: 'ingress.complete_event',
  },
  'ingress.dead-letter-event.v1': {
    operation: 'ingress.dead_letter_event',
  },
  'ingress.ingest-event.v1': {
    operation: 'ingress.ingest_event',
  },
  'ingress.link-webhook-receipt.v1': {
    operation: 'ingress.link_webhook_receipt',
  },
  'ingress.list-dead-events.v1': {
    operation: 'ingress.list_dead_events',
  },
  'ingress.measure-webhook-backlog.v1': {
    operation: 'ingress.measure_webhook_backlog',
  },
  'ingress.process-inbound-event.v1': {
    operation: 'ingress.process_inbound_event',
  },
  'ingress.purge-expired-webhook-receipts.v1': {
    operation: 'ingress.purge_expired_webhook_receipts',
  },
  'ingress.receive-cents-webhook.v1': {
    operation: 'ingress.receive_cents_webhook',
  },
  'ingress.reconcile-source-location-bindings.v1': {
    operation: 'ingress.reconcile_source_location_bindings',
  },
  'ingress.replay-dead-event.v1': {
    operation: 'ingress.replay_dead_event',
  },
  'ingress.resolve-source-location.v1': {
    operation: 'ingress.resolve_source_location',
  },
  'ingress.retry-event.v1': {
    operation: 'ingress.retry_event',
  },
  'orders.accept-incoming-order-proposal.v1': {
    operation: 'orders.accept_incoming_order_proposal',
  },
  'orders.cancel-order.v1': {
    operation: 'orders.cancel_order',
  },
  'orders.claim-order-outbox.v1': {
    operation: 'orders.claim_order_outbox',
  },
  'orders.close-incoming-order-source.v1': {
    operation: 'orders.close_incoming_order_source',
  },
  'orders.complete-order-outbox.v1': {
    operation: 'orders.complete_order_outbox',
  },
  'orders.complete-order.v1': {
    operation: 'orders.complete_order',
  },
  'orders.correct-order.v1': {
    operation: 'orders.correct_order',
  },
  'orders.create-order.v1': {
    operation: 'orders.create_order',
  },
  'orders.dead-letter-order-outbox.v1': {
    operation: 'orders.dead_letter_order_outbox',
  },
  'orders.get-canonical-order.v1': {
    operation: 'orders.get_canonical_order',
  },
  'orders.list-canonical-orders.v1': {
    operation: 'orders.list_canonical_orders',
  },
  'orders.list-incoming-order-proposals.v1': {
    operation: 'orders.list_incoming_order_proposals',
  },
  'orders.measure-order-outbox-backlog.v1': {
    operation: 'orders.measure_order_outbox_backlog',
  },
  'orders.propose-incoming-order.v1': {
    operation: 'orders.propose_incoming_order',
  },
  'orders.reject-incoming-order-proposal.v1': {
    operation: 'orders.reject_incoming_order_proposal',
  },
  'orders.release-fulfillment.v1': {
    operation: 'orders.release_fulfillment',
  },
  'orders.restore-incoming-order-proposal.v1': {
    operation: 'orders.restore_incoming_order_proposal',
  },
  'orders.retry-order-outbox.v1': {
    operation: 'orders.retry_order_outbox',
  },
  'orders.withdraw-fulfillment.v1': {
    operation: 'orders.withdraw_fulfillment',
  },
  'pricing.load-pricing-catalog.v1': {
    operation: 'pricing.load_pricing_catalog',
  },
  'pricing.plan-pricing-change.v1': {
    operation: 'pricing.plan_pricing_change',
  },
  'pricing.publish-pricing-change.v1': {
    operation: 'pricing.publish_pricing_change',
  },
  'processor.auth-login.v1': {
    operation: 'processor.authentication.login',
  },
  'processor.complete-mfa-challenge.v1': {
    operation: 'processor.authentication.complete_mfa_challenge',
  },
  'processor.list-production-history-activity.v1': {
    operation: 'processor.list_production_history_activity',
  },
  'processor.list-production-order-control.v1': {
    operation: 'processor.list_production_order_control',
  },
  'processor.load-auth-session.v1': {
    operation: 'processor.authentication.load_session',
  },
  'processor.load-production-board.v1': {
    operation: 'processor.load_production_board',
  },
  'processor.load-production-history-run.v1': {
    operation: 'processor.load_production_history_run',
  },
  'processor.load-production-workspace.v1': {
    operation: 'processor.load_production_workspace',
  },
  'processor.load-remaining-day-forecast.v1': {
    operation: 'processor.load_remaining_day_forecast',
  },
  'processor.logout.v1': {
    operation: 'processor.authentication.logout',
  },
  'processor.preview-production-order-backlog.v1': {
    operation: 'processor.preview_production_order_backlog',
  },
  'processor.resolve-access.v1': {
    operation: 'processor.resolve_access',
  },
  'production.accept-schedule.v1': {
    operation: 'production.accept_schedule',
  },
  'production.advance-stage.v1': {
    operation: 'production.advance_stage',
  },
  'production.apply-fulfillment-demand.v1': {
    operation: 'production.apply_fulfillment_demand',
  },
  'production.assign-stage-machines.v1': {
    operation: 'production.assign_stage_machines',
  },
  'production.attempt-automatic-placement.v1': {
    operation: 'production.attempt_automatic_placement',
  },
  'production.change-admission.v1': {
    operation: 'production.change_admission',
  },
  'production.change-order-resolution.v1': {
    operation: 'production.change_order_resolution',
  },
  'production.commit-order-backlog.v1': {
    operation: 'production.commit_order_backlog',
  },
  'production.commit-order-route.v1': {
    operation: 'production.commit_order_route',
  },
  'production.confirm-order-overtime.v1': {
    operation: 'production.confirm_order_overtime',
  },
  'production.create-schedule.v1': {
    operation: 'production.create_schedule',
  },
  'production.create-shift.v1': {
    operation: 'production.create_shift',
  },
  'production.freeze-batch-membership.v1': {
    operation: 'production.freeze_batch_membership',
  },
  'production.list-history-activity.v1': {
    operation: 'production.list_history_activity',
  },
  'production.list-history-plans.v1': {
    operation: 'production.list_history_plans',
  },
  'production.list-history-runs.v1': {
    operation: 'production.list_history_runs',
  },
  'production.list-locations.v1': {
    operation: 'production.list_locations',
  },
  'production.list-order-control.v1': {
    operation: 'production.list_order_control',
  },
  'production.list-orders.v1': {
    operation: 'production.list_orders',
  },
  'production.load-board.v1': {
    operation: 'production.load_board',
  },
  'production.load-history-run.v1': {
    operation: 'production.load_history_run',
  },
  'production.load-remaining-day-forecast.v1': {
    operation: 'production.load_remaining_day_forecast',
  },
  'production.load-schedule.v1': {
    operation: 'production.load_schedule',
  },
  'production.load-workspace.v1': {
    operation: 'production.load_workspace',
  },
  'production.manage-resources.v1': {
    operation: 'production.manage_resources',
  },
  'production.place-order-automatically.v1': {
    operation: 'production.place_order_automatically',
  },
  'production.place-order-exactly.v1': {
    operation: 'production.place_order_exactly',
  },
  'production.preview-order-backlog.v1': {
    operation: 'production.preview_order_backlog',
  },
  'production.preview-order-route.v1': {
    operation: 'production.preview_order_route',
  },
  'production.publish-scheduler-config.v1': {
    operation: 'production.publish_scheduler_config',
  },
  'production.reconcile-batch-progress.v1': {
    operation: 'production.reconcile_batch_progress',
  },
  'production.record-order-intake.v1': {
    operation: 'production.record_order_intake',
  },
  'production.replace-shift-selection.v1': {
    operation: 'production.replace_shift_selection',
  },
  'production.resolve-source-closed-fulfillment.v1': {
    operation: 'production.resolve_source_closed_fulfillment',
  },
  'production.set-order-priority.v1': {
    operation: 'production.set_order_priority',
  },
  'production.start-schedule.v1': {
    operation: 'production.start_schedule',
  },
  'production.subscribe-changes.v1': {
    operation: 'production.subscribe_changes',
  },
  'production.unfreeze-batch-membership.v1': {
    operation: 'production.unfreeze_batch_membership',
  },
  'production.update-shift.v1': {
    operation: 'production.update_shift',
  },
} as const);

export const observabilityJobsById = Object.freeze({
  'ingress.process-inbound-event-job.v1': {
    operationId: 'ingress.process-inbound-event.v1',
    operation: 'ingress.process_inbound_event',
    queue: 'webhook_ingestion',
  },
  'production.apply-fulfillment-demand-job.v2': {
    operationId: 'production.apply-fulfillment-demand.v1',
    operation: 'production.apply_fulfillment_demand',
    queue: 'order_outbox',
  },
} as const);

export const observabilityOperationIdByJobLabel = Object.freeze({
  webhook_ingestion: 'ingress.process-inbound-event.v1',
  order_outbox: 'production.apply-fulfillment-demand.v1',
} as const);

export const metricAttributeKeys = Object.freeze([
  'code',
  'disposition',
  'error_category',
  'event',
  'job',
  'kind',
  'method',
  'mode',
  'operation',
  'operation_id',
  'outcome',
  'phase',
  'reason',
  'route',
  'runCompleted',
  'runtime',
  'source',
  'status',
  'target',
  'type',
] as const);

export const metricCatalog = Object.freeze({
  'security.login_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'event', 'outcome', 'reason'],
    attributeValues: {
      outcome: ['succeeded', 'denied', 'failed'],
      runtime: observabilityRuntimeValues,
    },
  },
  'security.authorization_denials': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'event', 'outcome', 'reason'],
    attributeValues: {
      outcome: ['succeeded', 'denied', 'failed'],
      runtime: observabilityRuntimeValues,
    },
  },
  'security.webhook_authentication_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'event', 'outcome', 'reason'],
    attributeValues: {
      outcome: ['succeeded', 'denied', 'failed'],
      runtime: observabilityRuntimeValues,
    },
  },
  'security.rate_limits': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'event', 'outcome', 'reason'],
    attributeValues: {
      outcome: ['succeeded', 'denied', 'failed'],
      runtime: observabilityRuntimeValues,
    },
  },
  'security.critical_events': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'event', 'outcome', 'reason'],
    attributeValues: {
      outcome: ['succeeded', 'denied', 'failed'],
      runtime: observabilityRuntimeValues,
    },
  },
  'api.server_errors': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'operation',
      'route',
      'status',
      'phase',
      'reason',
      'error_category',
      'operation_id',
    ],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'web.critical_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'operation',
      'route',
      'status',
      'reason',
      'error_category',
      'operation_id',
    ],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'product.critical_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'operation',
      'status',
      'reason',
      'error_category',
      'operation_id',
    ],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.jobs_completed': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'job', 'source', 'operation_id'],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.jobs_retried': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'job',
      'source',
      'code',
      'error_category',
      'operation_id',
    ],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.jobs_failed': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'job',
      'source',
      'outcome',
      'code',
      'error_category',
      'operation_id',
    ],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.dead_letters': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'job',
      'source',
      'code',
      'error_category',
      'operation_id',
    ],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.leases_recovered': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'job', 'operation_id'],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.lease_losses': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'job', 'disposition', 'operation_id'],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.loop_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'operation',
      'error_category',
      'operation_id',
    ],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'api.command_conflicts': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'route', 'operation', 'operation_id'],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'api.http_requests': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'method', 'route', 'status', 'outcome'],
    attributeValues: {
      method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      status: ['1xx', '2xx', '3xx', '4xx', '5xx'],
      outcome: ['completed', 'aborted'],
      runtime: observabilityRuntimeValues,
    },
  },
  'api.sse_connections': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'outcome'],
    attributeValues: {
      outcome: ['opened', 'closed'],
      runtime: observabilityRuntimeValues,
    },
  },
  'api.sse_events': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'type'],
    attributeValues: {
      type: ['ready', 'change', 'resync'],
      runtime: observabilityRuntimeValues,
    },
  },
  'api.sse_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'reason'],
    attributeValues: {
      reason: ['invalid_frame', 'session_close', 'source_error', 'write_error'],
      runtime: observabilityRuntimeValues,
    },
  },
  'api.sse_resyncs': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'reason'],
    attributeValues: {
      runtime: observabilityRuntimeValues,
    },
  },
  'api.sse_feed_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'operation',
      'reason',
      'error_category',
      'operation_id',
    ],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'product.invariant_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'route',
      'operation',
      'error_category',
      'operation_id',
    ],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'db.transactions': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'operation', 'outcome', 'operation_id'],
    attributeValues: {
      outcome: ['committed', 'expected_rollback', 'failed'],
      runtime: observabilityRuntimeValues,
      operation: observabilityOperationNames,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.job_passes': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'job', 'outcome', 'operation_id'],
    attributeValues: {
      outcome: ['busy', 'idle', 'failed'],
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'deployment.failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'phase',
      'operation',
      'reason',
      'operation_id',
    ],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'api.http_request_duration_seconds': {
    instrument: 'distribution',
    unit: 'second',
    allowedAttributes: ['runtime', 'method', 'route', 'status', 'outcome'],
    attributeValues: {
      method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      status: ['1xx', '2xx', '3xx', '4xx', '5xx'],
      outcome: ['completed', 'aborted'],
      runtime: observabilityRuntimeValues,
    },
  },
  'api.sse_active_connections': {
    instrument: 'gauge',
    unit: 'count',
    allowedAttributes: ['runtime'],
    attributeValues: {
      runtime: observabilityRuntimeValues,
    },
  },
  'db.transaction_duration_seconds': {
    instrument: 'distribution',
    unit: 'second',
    allowedAttributes: ['runtime', 'operation', 'outcome', 'operation_id'],
    attributeValues: {
      outcome: ['committed', 'expected_rollback', 'failed'],
      runtime: observabilityRuntimeValues,
      operation: observabilityOperationNames,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.job_pass_duration_seconds': {
    instrument: 'distribution',
    unit: 'second',
    allowedAttributes: ['runtime', 'job', 'outcome', 'operation_id'],
    attributeValues: {
      outcome: ['busy', 'idle', 'failed'],
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.outbox_pending_count': {
    instrument: 'gauge',
    unit: 'count',
    allowedAttributes: ['runtime', 'job', 'operation_id'],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.outbox_oldest_pending_age_seconds': {
    instrument: 'gauge',
    unit: 'second',
    allowedAttributes: ['runtime', 'job', 'operation_id'],
    attributeValues: {
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'production.plan_supersessions': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'operation', 'operation_id'],
    attributeValues: {
      operation: ['compute_replace_current'],
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'production.runs_started': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime'],
    attributeValues: {
      runtime: observabilityRuntimeValues,
    },
  },
  'production.placement_outcomes': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'status', 'mode', 'reason'],
    attributeValues: {
      status: ['placed', 'confirmation_required', 'not_placed'],
      mode: ['automatic', 'manager_exact'],
      reason: [
        'none',
        'hard_capacity_exceeded',
        'run_not_started',
        'run_completed',
        'order_not_eligible',
        'order_already_scheduled',
        'no_mutable_position',
        'queue_conflict',
        'proposal_stale',
      ],
      runtime: observabilityRuntimeValues,
    },
  },
  'production.queue_conflicts': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'operation', 'operation_id'],
    attributeValues: {
      operation: [
        'automatic_placement',
        'freeze_membership',
        'manager_exact_placement',
        'overtime_confirmation',
        'unfreeze_membership',
        'order_route_commit',
        'order_route_preview',
      ],
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'production.batch_freezes': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'source'],
    attributeValues: {
      source: ['explicit', 'stage_start'],
      runtime: observabilityRuntimeValues,
    },
  },
  'production.overtime_confirmations': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'status'],
    attributeValues: {
      status: ['placed'],
      runtime: observabilityRuntimeValues,
    },
  },
  'production.order_route_outcomes': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'operation',
      'status',
      'kind',
      'reason',
      'operation_id',
    ],
    attributeValues: {
      operation: ['preview', 'commit'],
      status: [
        'proposed',
        'committed',
        'replayed',
        'rejected',
        'conflict',
        'failed',
      ],
      kind: ['queued_move', 'exception'],
      reason: [
        'manual_rebatch',
        'needs_more_drying',
        'rewash_required',
        'sorting_incomplete',
        'stage_incomplete',
        'other',
      ],
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'production.progress_reconciliations': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'target', 'runCompleted'],
    attributeValues: {
      target: [
        'sorting_started',
        'sorting_completed',
        'washing_started',
        'washing_completed',
        'drying_started',
        'drying_completed',
        'folding_packaging_started',
        'finished',
      ],
      runCompleted: ['true', 'false'],
      runtime: observabilityRuntimeValues,
    },
  },
  'worker.inbox_receipts': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'source'],
    attributeValues: {
      source: ['cents'],
      runtime: observabilityRuntimeValues,
    },
  },
  'worker.inbox_oldest_pending_age_seconds': {
    instrument: 'gauge',
    unit: 'second',
    allowedAttributes: ['runtime', 'job', 'operation_id'],
    attributeValues: {
      job: ['webhook_ingestion'],
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.inbox_pending_count': {
    instrument: 'gauge',
    unit: 'count',
    allowedAttributes: ['runtime', 'job', 'operation_id'],
    attributeValues: {
      job: ['webhook_ingestion'],
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'worker.processing_latency_seconds': {
    instrument: 'distribution',
    unit: 'second',
    allowedAttributes: ['runtime', 'job', 'source', 'operation_id'],
    attributeValues: {
      job: ['webhook_ingestion'],
      source: ['cents'],
      runtime: observabilityRuntimeValues,
      operation_id: observabilityOperationIds,
    },
  },
  'api.webhook_rejections': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'source', 'reason', 'status'],
    attributeValues: {
      source: ['cents'],
      runtime: observabilityRuntimeValues,
    },
  },
} as const);

export type ObservabilityOperationId =
  (typeof observabilityOperationIds)[number];
export type ObservabilityOperationName =
  (typeof observabilityOperationNames)[number];
export type ObservabilityJobId = keyof typeof observabilityJobsById;
export type ObservabilityJobLabel =
  keyof typeof observabilityOperationIdByJobLabel;
export type MetricName = keyof typeof metricCatalog;
export type MetricAttributeKey = (typeof metricAttributeKeys)[number];
export type MetricDefinition = (typeof metricCatalog)[MetricName];
export type MetricInstrument = MetricDefinition['instrument'];
export type MetricUnit = MetricDefinition['unit'];
export type CounterName = {
  [Name in MetricName]: (typeof metricCatalog)[Name]['instrument'] extends 'counter'
    ? Name
    : never;
}[MetricName];
export type MeasurementName = Exclude<MetricName, CounterName>;

export const isMetricName = (name: string): name is MetricName =>
  Object.hasOwn(metricCatalog, name);

export const observabilityOperationIdFor = (
  operation: string,
): ObservabilityOperationId | undefined =>
  Object.hasOwn(observabilityOperationIdByName, operation)
    ? (
        observabilityOperationIdByName as Readonly<
          Record<string, ObservabilityOperationId>
        >
      )[operation]
    : undefined;

export const observabilityOperationIdForJobLabel = (
  job: string,
): ObservabilityOperationId | undefined =>
  Object.hasOwn(observabilityOperationIdByJobLabel, job)
    ? (
        observabilityOperationIdByJobLabel as Readonly<
          Record<string, ObservabilityOperationId>
        >
      )[job]
    : undefined;
