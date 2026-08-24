CREATE TYPE "public"."auth_access_grant_state" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."auth_assurance_level" AS ENUM('password', 'mfa', 'service_key');--> statement-breakpoint
CREATE TYPE "public"."auth_mfa_status" AS ENUM('pending', 'enabled');--> statement-breakpoint
CREATE TYPE "public"."stage_boundary_provenance" AS ENUM('live_observed', 'operator_reported', 'not_recorded');--> statement-breakpoint
CREATE TYPE "public"."workforce_invitation_state" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."workforce_membership_state" AS ENUM('active', 'suspended', 'ended');--> statement-breakpoint
CREATE TABLE "access_production_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_production_locations_id_business_unique" UNIQUE("id","business_id")
);
--> statement-breakpoint
CREATE TABLE "auth_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"role" text NOT NULL,
	"scope_kind" text NOT NULL,
	"scope_id" text NOT NULL,
	"scope_resource_type" text DEFAULT '*' NOT NULL,
	"location_id" text,
	"state" "auth_access_grant_state" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_identity_id" uuid,
	"revocation_reason" text,
	"expired_at" timestamp with time zone,
	"created_by_identity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_access_grants_positive_version" CHECK ("auth_access_grants"."version" > 0),
	CONSTRAINT "auth_access_grants_role_valid" CHECK ("auth_access_grants"."role" in ('owner', 'manager', 'operator')),
	CONSTRAINT "auth_access_grants_scope_shape" CHECK (("auth_access_grants"."scope_kind" = 'business' and "auth_access_grants"."scope_id" = "auth_access_grants"."business_id"::text and "auth_access_grants"."scope_resource_type" = '*' and "auth_access_grants"."location_id" is null) or ("auth_access_grants"."scope_kind" = 'location' and "auth_access_grants"."scope_id" = "auth_access_grants"."location_id" and "auth_access_grants"."scope_resource_type" = '*' and "auth_access_grants"."location_id" is not null) or ("auth_access_grants"."scope_kind" = 'resource' and "auth_access_grants"."scope_resource_type" <> '*' and length(btrim("auth_access_grants"."scope_id")) > 0 and "auth_access_grants"."location_id" is null)),
	CONSTRAINT "auth_access_grants_role_scope_valid" CHECK (("auth_access_grants"."role" = 'owner' and "auth_access_grants"."scope_kind" = 'business' and "auth_access_grants"."ends_at" is null) or ("auth_access_grants"."role" = 'manager' and "auth_access_grants"."scope_kind" in ('business', 'location')) or ("auth_access_grants"."role" = 'operator' and "auth_access_grants"."scope_kind" = 'location')),
	CONSTRAINT "auth_access_grants_window_valid" CHECK ("auth_access_grants"."ends_at" is null or "auth_access_grants"."starts_at" is null or "auth_access_grants"."ends_at" > "auth_access_grants"."starts_at"),
	CONSTRAINT "auth_access_grants_state_timestamps_valid" CHECK (("auth_access_grants"."state" = 'active' and "auth_access_grants"."revoked_at" is null and "auth_access_grants"."revoked_by_identity_id" is null and "auth_access_grants"."revocation_reason" is null and "auth_access_grants"."expired_at" is null) or ("auth_access_grants"."state" = 'revoked' and "auth_access_grants"."revoked_at" is not null and "auth_access_grants"."revoked_by_identity_id" is not null and length(btrim("auth_access_grants"."revocation_reason")) > 0 and "auth_access_grants"."expired_at" is null) or ("auth_access_grants"."state" = 'expired' and "auth_access_grants"."revoked_at" is null and "auth_access_grants"."revoked_by_identity_id" is null and "auth_access_grants"."revocation_reason" is null and "auth_access_grants"."expired_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "auth_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid,
	"principal_identity_id" uuid,
	"event_type" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_command_receipts" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"aggregate_kind" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"command_hash" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_identity_id" uuid,
	"result_metadata_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_command_receipts_command_hash_shape" CHECK ("auth_command_receipts"."command_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "auth_command_receipts_actor_valid" CHECK (("auth_command_receipts"."actor_kind" = 'human' and "auth_command_receipts"."actor_identity_id" is not null and "auth_command_receipts"."actor_id" = "auth_command_receipts"."actor_identity_id"::text) or ("auth_command_receipts"."actor_kind" in ('service', 'system') and length(btrim("auth_command_receipts"."actor_id")) > 0)),
	CONSTRAINT "auth_command_receipts_result_object" CHECK (jsonb_typeof("auth_command_receipts"."result_metadata_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"email_normalized" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identities_email_unique" UNIQUE("email"),
	CONSTRAINT "auth_identities_email_normalized_unique" UNIQUE("email_normalized"),
	CONSTRAINT "auth_identities_kind_valid" CHECK ("auth_identities"."kind" in ('human', 'service')),
	CONSTRAINT "auth_identities_customer_link_human" CHECK ("auth_identities"."customer_id" is null or "auth_identities"."kind" = 'human')
);
--> statement-breakpoint
CREATE TABLE "auth_lifecycle_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"aggregate_kind" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"command_hash" text NOT NULL,
	"origin" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_identity_id" uuid,
	"reason_code" text NOT NULL,
	"reason_note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_lifecycle_transitions_positive_version" CHECK ("auth_lifecycle_transitions"."aggregate_version" > 1),
	CONSTRAINT "auth_lifecycle_transitions_command_hash_shape" CHECK ("auth_lifecycle_transitions"."command_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "auth_lifecycle_transitions_actor_valid" CHECK (("auth_lifecycle_transitions"."actor_kind" = 'human' and "auth_lifecycle_transitions"."actor_identity_id" is not null and "auth_lifecycle_transitions"."actor_id" = "auth_lifecycle_transitions"."actor_identity_id"::text) or ("auth_lifecycle_transitions"."actor_kind" in ('service', 'system') and length(btrim("auth_lifecycle_transitions"."actor_id")) > 0)),
	CONSTRAINT "auth_lifecycle_transitions_context_present" CHECK (length(btrim("auth_lifecycle_transitions"."idempotency_key")) > 0 and length(btrim("auth_lifecycle_transitions"."origin")) > 0 and length(btrim("auth_lifecycle_transitions"."reason_code")) > 0 and ("auth_lifecycle_transitions"."reason_note" is null or length(btrim("auth_lifecycle_transitions"."reason_note")) > 0)),
	CONSTRAINT "auth_lifecycle_transitions_edge_valid" CHECK (("auth_lifecycle_transitions"."aggregate_kind" = 'invitation' and "auth_lifecycle_transitions"."from_state" = 'pending' and (("auth_lifecycle_transitions"."event_type" = 'accept' and "auth_lifecycle_transitions"."to_state" = 'accepted') or ("auth_lifecycle_transitions"."event_type" = 'revoke' and "auth_lifecycle_transitions"."to_state" = 'revoked') or ("auth_lifecycle_transitions"."event_type" = 'expire' and "auth_lifecycle_transitions"."to_state" = 'expired'))) or ("auth_lifecycle_transitions"."aggregate_kind" = 'membership' and (("auth_lifecycle_transitions"."from_state" = 'active' and "auth_lifecycle_transitions"."event_type" = 'suspend' and "auth_lifecycle_transitions"."to_state" = 'suspended') or ("auth_lifecycle_transitions"."from_state" = 'suspended' and "auth_lifecycle_transitions"."event_type" = 'reactivate' and "auth_lifecycle_transitions"."to_state" = 'active') or ("auth_lifecycle_transitions"."from_state" in ('active', 'suspended') and "auth_lifecycle_transitions"."event_type" = 'end' and "auth_lifecycle_transitions"."to_state" = 'ended'))) or ("auth_lifecycle_transitions"."aggregate_kind" = 'access_grant' and "auth_lifecycle_transitions"."from_state" = 'active' and (("auth_lifecycle_transitions"."event_type" = 'revoke' and "auth_lifecycle_transitions"."to_state" = 'revoked') or ("auth_lifecycle_transitions"."event_type" = 'expire' and "auth_lifecycle_transitions"."to_state" = 'expired'))))
);
--> statement-breakpoint
CREATE TABLE "auth_login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_normalized" text NOT NULL,
	"identity_id" uuid,
	"success" boolean NOT NULL,
	"failure_code" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_mfa_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_mfa_challenges_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "auth_mfa_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"encrypted_secret" text NOT NULL,
	"status" "auth_mfa_status" DEFAULT 'pending' NOT NULL,
	"last_used_counter" bigint,
	"enabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_mfa_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_mfa_recovery_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "auth_password_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"password_hash" text NOT NULL,
	"password_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"assurance_level" "auth_assurance_level" DEFAULT 'password' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "production_bags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_order_id" uuid NOT NULL,
	"bag_index" integer NOT NULL,
	"status" text DEFAULT 'eligible' NOT NULL,
	CONSTRAINT "production_bags_nonnegative_index" CHECK ("production_bags"."bag_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "business_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_accounts_slug_shape" CHECK ("business_accounts"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "business_accounts_status_valid" CHECK ("business_accounts"."status" in ('active', 'suspended')),
	CONSTRAINT "business_accounts_positive_version" CHECK ("business_accounts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_machines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"station_id" uuid NOT NULL,
	"label" text NOT NULL,
	"manufacturer_capacity_lbs" numeric(12, 3),
	"effective_capacity_lbs" numeric(12, 3),
	"capacity_safety_margin_lbs" numeric(12, 3),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_machines_id_location_unique" UNIQUE("id","location_id"),
	CONSTRAINT "production_machines_effective_capacity_positive" CHECK ("production_machines"."effective_capacity_lbs" is null or "production_machines"."effective_capacity_lbs" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_command_receipts" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"command_hash" text NOT NULL,
	"origin" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"result_json" jsonb NOT NULL,
	"reason_code" text,
	"reason_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_command_receipts_actor_kind_valid" CHECK ("order_command_receipts"."actor_kind" in ('human', 'service', 'system')),
	CONSTRAINT "order_command_receipts_context_present" CHECK (length(trim("order_command_receipts"."origin")) > 0 and length(trim("order_command_receipts"."actor_id")) > 0),
	CONSTRAINT "order_command_receipts_reason_consistent" CHECK (("order_command_receipts"."reason_code" is null and "order_command_receipts"."reason_note" is null) or ("order_command_receipts"."reason_code" is not null and length(btrim("order_command_receipts"."reason_code")) > 0 and ("order_command_receipts"."reason_note" is null or length(btrim("order_command_receipts"."reason_note")) > 0)))
);
--> statement-breakpoint
CREATE TABLE "order_demands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fulfillment_id" uuid NOT NULL,
	"fulfillment_version" integer NOT NULL,
	"projection_hash" text NOT NULL,
	"admission_state" text NOT NULL,
	"commercial_state" text NOT NULL,
	"display_reference" text NOT NULL,
	"location_id" text NOT NULL,
	"revision_at" timestamp with time zone NOT NULL,
	"phase" text NOT NULL,
	"estimated_weight_lbs" numeric(12, 3),
	"estimated_weight_source" text,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_demands_id_location_unique" UNIQUE("id","location_id"),
	CONSTRAINT "order_demands_fulfillment_version_positive" CHECK ("order_demands"."fulfillment_version" > 0),
	CONSTRAINT "order_demands_projection_hash_shape" CHECK ("order_demands"."projection_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "order_demands_admission_state_valid" CHECK ("order_demands"."admission_state" in ('unreleased', 'released', 'withdrawn')),
	CONSTRAINT "order_demands_commercial_state_valid" CHECK ("order_demands"."commercial_state" in ('open', 'completed', 'canceled')),
	CONSTRAINT "order_demands_phase_valid" CHECK ("order_demands"."phase" in ('expected', 'inbound', 'production_released', 'post_production', 'withdrawn')),
	CONSTRAINT "order_demands_estimated_weight_positive" CHECK ("order_demands"."estimated_weight_lbs" is null or "order_demands"."estimated_weight_lbs" > 0),
	CONSTRAINT "order_demands_estimated_weight_provenance_consistent" CHECK (("order_demands"."estimated_weight_lbs" is null) = ("order_demands"."estimated_weight_source" is null))
);
--> statement-breakpoint
CREATE TABLE "order_fulfillments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"type_code" text NOT NULL,
	"location_id" text NOT NULL,
	"release_state" text DEFAULT 'unreleased' NOT NULL,
	"estimated_weight_lbs" numeric(12, 3),
	"estimated_weight_source" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_fulfillments_release_state_valid" CHECK ("order_fulfillments"."release_state" in ('unreleased', 'released', 'withdrawn')),
	CONSTRAINT "order_fulfillments_weight_positive" CHECK ("order_fulfillments"."estimated_weight_lbs" is null or "order_fulfillments"."estimated_weight_lbs" > 0),
	CONSTRAINT "order_fulfillments_weight_provenance_consistent" CHECK (("order_fulfillments"."estimated_weight_lbs" is null) = ("order_fulfillments"."estimated_weight_source" is null)),
	CONSTRAINT "order_fulfillments_positive_version" CHECK ("order_fulfillments"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"line_key" text NOT NULL,
	"item_type" text DEFAULT 'service' NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"total_amount_cents" integer NOT NULL,
	"source_metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_values_nonnegative" CHECK ("order_items"."quantity" >= 0 and "order_items"."unit_price_cents" >= 0 and "order_items"."total_amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"fulfillment_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_version" integer NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"dead_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_outbox_events_status_valid" CHECK ("order_outbox_events"."status" in ('pending', 'processing', 'completed', 'dead')),
	CONSTRAINT "order_outbox_events_attempts_nonnegative" CHECK ("order_outbox_events"."attempts" >= 0),
	CONSTRAINT "order_outbox_events_positive_version" CHECK ("order_outbox_events"."aggregate_version" > 0),
	CONSTRAINT "order_outbox_events_lease_consistent" CHECK (("order_outbox_events"."status" = 'processing' and "order_outbox_events"."lease_owner" is not null and "order_outbox_events"."lease_expires_at" is not null and "order_outbox_events"."completed_at" is null and "order_outbox_events"."dead_at" is null) or ("order_outbox_events"."status" = 'pending' and "order_outbox_events"."lease_owner" is null and "order_outbox_events"."lease_expires_at" is null and "order_outbox_events"."completed_at" is null and "order_outbox_events"."dead_at" is null) or ("order_outbox_events"."status" = 'completed' and "order_outbox_events"."lease_owner" is null and "order_outbox_events"."lease_expires_at" is null and "order_outbox_events"."completed_at" is not null and "order_outbox_events"."dead_at" is null) or ("order_outbox_events"."status" = 'dead' and "order_outbox_events"."lease_owner" is null and "order_outbox_events"."lease_expires_at" is null and "order_outbox_events"."completed_at" is null and "order_outbox_events"."dead_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "order_source_customer_refs" (
	"order_source_link_id" uuid PRIMARY KEY NOT NULL,
	"external_user_id" text,
	"resolved_customer_id" uuid,
	"resolution" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_source_customer_refs_resolution_valid" CHECK ("order_source_customer_refs"."resolution" in ('resolved', 'not_provided', 'pending', 'conflict')),
	CONSTRAINT "order_source_customer_refs_resolution_consistent" CHECK (("order_source_customer_refs"."resolution" = 'resolved' and "order_source_customer_refs"."external_user_id" is not null and "order_source_customer_refs"."resolved_customer_id" is not null) or ("order_source_customer_refs"."resolution" = 'not_provided' and "order_source_customer_refs"."external_user_id" is null and "order_source_customer_refs"."resolved_customer_id" is null) or ("order_source_customer_refs"."resolution" in ('pending', 'conflict') and "order_source_customer_refs"."external_user_id" is not null and "order_source_customer_refs"."resolved_customer_id" is null))
);
--> statement-breakpoint
CREATE TABLE "order_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_order_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_source_proposal_resolutions" (
	"proposal_id" uuid PRIMARY KEY NOT NULL,
	"decision" text NOT NULL,
	"proposal_version" integer NOT NULL,
	"order_id" uuid,
	"fulfillment_id" uuid,
	"idempotency_key" text NOT NULL,
	"command_hash" text NOT NULL,
	"origin" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"reason_note" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_source_proposal_resolutions_decision_valid" CHECK ("order_source_proposal_resolutions"."decision" in ('accepted', 'rejected')),
	CONSTRAINT "order_source_proposal_resolutions_version_valid" CHECK ("order_source_proposal_resolutions"."proposal_version" > 1),
	CONSTRAINT "order_source_proposal_resolutions_effect_consistent" CHECK (("order_source_proposal_resolutions"."decision" = 'accepted' and "order_source_proposal_resolutions"."order_id" is not null and "order_source_proposal_resolutions"."fulfillment_id" is not null) or ("order_source_proposal_resolutions"."decision" = 'rejected' and "order_source_proposal_resolutions"."order_id" is null and "order_source_proposal_resolutions"."fulfillment_id" is null)),
	CONSTRAINT "order_source_proposal_resolutions_command_hash_shape" CHECK ("order_source_proposal_resolutions"."command_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "order_source_proposal_resolutions_actor_kind_valid" CHECK ("order_source_proposal_resolutions"."actor_kind" in ('human', 'service', 'system')),
	CONSTRAINT "order_source_proposal_resolutions_context_present" CHECK (length(btrim("order_source_proposal_resolutions"."idempotency_key")) > 0 and length(btrim("order_source_proposal_resolutions"."origin")) > 0 and length(btrim("order_source_proposal_resolutions"."actor_id")) > 0 and length(btrim("order_source_proposal_resolutions"."reason_code")) > 0 and ("order_source_proposal_resolutions"."reason_note" is null or length(btrim("order_source_proposal_resolutions"."reason_note")) > 0))
);
--> statement-breakpoint
CREATE TABLE "order_source_proposal_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"event_type" text NOT NULL,
	"proposal_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"command_hash" text NOT NULL,
	"origin" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"reason_note" text,
	"source_terminal_code" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_source_proposal_transitions_states_valid" CHECK ("order_source_proposal_transitions"."from_state" in ('pending', 'source_closed', 'restored_pending') and "order_source_proposal_transitions"."to_state" in ('source_closed', 'restored_pending', 'accepted', 'rejected')),
	CONSTRAINT "order_source_proposal_transitions_event_valid" CHECK ("order_source_proposal_transitions"."event_type" in ('accept', 'reject', 'source_close', 'restore')),
	CONSTRAINT "order_source_proposal_transitions_edge_consistent" CHECK (("order_source_proposal_transitions"."from_state" = 'pending' and "order_source_proposal_transitions"."event_type" = 'accept' and "order_source_proposal_transitions"."to_state" = 'accepted') or ("order_source_proposal_transitions"."from_state" = 'pending' and "order_source_proposal_transitions"."event_type" = 'reject' and "order_source_proposal_transitions"."to_state" = 'rejected') or ("order_source_proposal_transitions"."from_state" = 'pending' and "order_source_proposal_transitions"."event_type" = 'source_close' and "order_source_proposal_transitions"."to_state" = 'source_closed') or ("order_source_proposal_transitions"."from_state" = 'source_closed' and "order_source_proposal_transitions"."event_type" = 'restore' and "order_source_proposal_transitions"."to_state" = 'restored_pending') or ("order_source_proposal_transitions"."from_state" = 'restored_pending' and "order_source_proposal_transitions"."event_type" = 'accept' and "order_source_proposal_transitions"."to_state" = 'accepted') or ("order_source_proposal_transitions"."from_state" = 'restored_pending' and "order_source_proposal_transitions"."event_type" = 'reject' and "order_source_proposal_transitions"."to_state" = 'rejected')),
	CONSTRAINT "order_source_proposal_transitions_version_valid" CHECK ("order_source_proposal_transitions"."proposal_version" > 1),
	CONSTRAINT "order_source_proposal_transitions_command_hash_shape" CHECK ("order_source_proposal_transitions"."command_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "order_source_proposal_transitions_actor_kind_valid" CHECK ("order_source_proposal_transitions"."actor_kind" in ('human', 'service', 'system')),
	CONSTRAINT "order_source_proposal_transitions_context_present" CHECK (length(btrim("order_source_proposal_transitions"."idempotency_key")) > 0 and length(btrim("order_source_proposal_transitions"."origin")) > 0 and length(btrim("order_source_proposal_transitions"."actor_id")) > 0 and length(btrim("order_source_proposal_transitions"."reason_code")) > 0 and ("order_source_proposal_transitions"."reason_note" is null or length(btrim("order_source_proposal_transitions"."reason_note")) > 0)),
	CONSTRAINT "order_source_proposal_transitions_terminal_consistent" CHECK (("order_source_proposal_transitions"."event_type" = 'source_close' and "order_source_proposal_transitions"."source_terminal_code" in ('completed', 'canceled')) or ("order_source_proposal_transitions"."event_type" <> 'source_close' and "order_source_proposal_transitions"."source_terminal_code" is null))
);
--> statement-breakpoint
CREATE TABLE "order_source_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_order_id" text NOT NULL,
	"location_id" text NOT NULL,
	"proposal_kind" text NOT NULL,
	"source_revision_at" timestamp with time zone NOT NULL,
	"source_revision_hash" text NOT NULL,
	"adapter_version" text NOT NULL,
	"proposal_snapshot_json" jsonb NOT NULL,
	"customer_display_name" text,
	"customer_phone" text,
	"customer_email" text,
	"display_number" text,
	"due_at" timestamp with time zone NOT NULL,
	"estimated_weight_lbs" numeric(12, 3),
	"observed_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_source_proposals_identity_present" CHECK (length(btrim("order_source_proposals"."source")) > 0 and length(btrim("order_source_proposals"."external_order_id")) > 0 and length(btrim("order_source_proposals"."location_id")) > 0 and length(btrim("order_source_proposals"."adapter_version")) > 0),
	CONSTRAINT "order_source_proposals_kind_valid" CHECK ("order_source_proposals"."proposal_kind" in ('pickup', 'submitted_order')),
	CONSTRAINT "order_source_proposals_hash_shape" CHECK ("order_source_proposals"."source_revision_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "order_source_proposals_snapshot_object" CHECK (jsonb_typeof("order_source_proposals"."proposal_snapshot_json") = 'object'),
	CONSTRAINT "order_source_proposals_weight_positive" CHECK ("order_source_proposals"."estimated_weight_lbs" is null or "order_source_proposals"."estimated_weight_lbs" > 0),
	CONSTRAINT "order_source_proposals_state_valid" CHECK ("order_source_proposals"."state" in ('pending', 'source_closed', 'restored_pending', 'accepted', 'rejected')),
	CONSTRAINT "order_source_proposals_positive_version" CHECK ("order_source_proposals"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_source_snapshots" (
	"source_link_id" uuid PRIMARY KEY NOT NULL,
	"source_revision_at" timestamp with time zone NOT NULL,
	"source_revision_hash" text NOT NULL,
	"adapter_version" text NOT NULL,
	"source_lifecycle_code" text,
	"normalized_payload_json" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_source_snapshots_hash_shape" CHECK ("order_source_snapshots"."source_revision_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "order_source_terminal_tombstones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_order_id" text NOT NULL,
	"proposal_id" uuid,
	"terminal_code" text NOT NULL,
	"source_revision_at" timestamp with time zone NOT NULL,
	"source_revision_hash" text NOT NULL,
	"adapter_version" text NOT NULL,
	"normalized_payload_json" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_source_terminal_tombstones_identity_present" CHECK (length(btrim("order_source_terminal_tombstones"."source")) > 0 and length(btrim("order_source_terminal_tombstones"."external_order_id")) > 0 and length(btrim("order_source_terminal_tombstones"."adapter_version")) > 0),
	CONSTRAINT "order_source_terminal_tombstones_code_valid" CHECK ("order_source_terminal_tombstones"."terminal_code" in ('completed', 'canceled')),
	CONSTRAINT "order_source_terminal_tombstones_hash_shape" CHECK ("order_source_terminal_tombstones"."source_revision_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "order_source_terminal_tombstones_payload_object" CHECK (jsonb_typeof("order_source_terminal_tombstones"."normalized_payload_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid,
	"customer_version" integer,
	"customer_first_name" text,
	"customer_last_name" text,
	"customer_business_name" text,
	"customer_phone" text,
	"customer_email" text,
	"customer_resolution" text NOT NULL,
	"display_number" text,
	"state" text DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"total_amount_cents" integer DEFAULT 0 NOT NULL,
	"balance_due_cents" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_id_business_unique" UNIQUE("id","business_id"),
	CONSTRAINT "orders_customer_resolution_valid" CHECK ("orders"."customer_resolution" in ('resolved', 'not_provided', 'pending', 'conflict')),
	CONSTRAINT "orders_customer_resolution_consistent" CHECK (("orders"."customer_resolution" = 'resolved' and "orders"."customer_id" is not null and "orders"."customer_version" is not null and "orders"."customer_version" > 0) or ("orders"."customer_resolution" <> 'resolved' and "orders"."customer_id" is null and "orders"."customer_version" is null and "orders"."customer_first_name" is null and "orders"."customer_last_name" is null and "orders"."customer_business_name" is null and "orders"."customer_phone" is null and "orders"."customer_email" is null)),
	CONSTRAINT "orders_state_valid" CHECK ("orders"."state" in ('open', 'completed', 'canceled')),
	CONSTRAINT "orders_currency_shape" CHECK ("orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_amounts_nonnegative" CHECK ("orders"."total_amount_cents" >= 0 and ("orders"."balance_due_cents" is null or "orders"."balance_due_cents" >= 0)),
	CONSTRAINT "orders_positive_version" CHECK ("orders"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "pricing_change_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_display_name" text NOT NULL,
	"service_slug" text NOT NULL,
	"reason" text NOT NULL,
	"old_pricing_set_id" uuid NOT NULL,
	"new_pricing_set_id" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pricing_set_id" uuid NOT NULL,
	"code" text NOT NULL,
	"service" text NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"price_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pricing_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_batch_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"production_batch_id" uuid NOT NULL,
	"production_order_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"placement_provenance" text DEFAULT 'initial_schedule' NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"placed_by" uuid,
	"pinned_at" timestamp with time zone,
	"pinned_by" uuid,
	"released_at" timestamp with time zone,
	"released_by" uuid,
	"release_reason" text,
	CONSTRAINT "production_batch_orders_known_placement_provenance" CHECK ("production_batch_orders"."placement_provenance" in ('initial_schedule', 'automatic', 'manager_exact', 'manual_rebatch', 'exception_route')),
	CONSTRAINT "production_batch_orders_pin_valid" CHECK (("production_batch_orders"."placement_provenance" in ('manager_exact', 'manual_rebatch') and "production_batch_orders"."pinned_at" is not null and "production_batch_orders"."pinned_by" is not null) or ("production_batch_orders"."placement_provenance" not in ('manager_exact', 'manual_rebatch') and "production_batch_orders"."pinned_at" is null and "production_batch_orders"."pinned_by" is null)),
	CONSTRAINT "production_batch_orders_release_valid" CHECK (("production_batch_orders"."released_at" is null and "production_batch_orders"."released_by" is null and "production_batch_orders"."release_reason" is null) or ("production_batch_orders"."active" = false and "production_batch_orders"."released_at" is not null and "production_batch_orders"."released_by" is not null and "production_batch_orders"."release_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "production_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"production_run_id" uuid NOT NULL,
	"sequence_index" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"pulse_capacity_lbs" numeric(12, 3) NOT NULL,
	"derived_weight_lbs" numeric(12, 3) NOT NULL,
	"pulse_minutes" integer NOT NULL,
	"planned_done_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"membership_frozen_at" timestamp with time zone,
	"membership_frozen_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_batches_id_location_unique" UNIQUE("id","location_id"),
	CONSTRAINT "production_batches_valid_capacity" CHECK ("production_batches"."derived_weight_lbs" > 0 and "production_batches"."derived_weight_lbs" <= "production_batches"."pulse_capacity_lbs" and "production_batches"."pulse_minutes" > 0),
	CONSTRAINT "production_batches_positive_version" CHECK ("production_batches"."version" > 0),
	CONSTRAINT "production_batches_membership_freeze_paired" CHECK (("production_batches"."membership_frozen_at" is null) = ("production_batches"."membership_frozen_by" is null)),
	CONSTRAINT "production_batches_nonqueued_membership_frozen" CHECK ("production_batches"."status" = 'queued' or ("production_batches"."membership_frozen_at" is not null and "production_batches"."membership_frozen_by" is not null)),
	CONSTRAINT "production_batches_lifecycle_timestamps_valid" CHECK (("production_batches"."status" = 'queued' and "production_batches"."started_at" is null and "production_batches"."finished_at" is null) or ("production_batches"."status" <> 'queued' and "production_batches"."started_at" is not null and (("production_batches"."status" = 'finished') = ("production_batches"."finished_at" is not null))))
);
--> statement-breakpoint
CREATE TABLE "production_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"live_revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_order_stage_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"production_run_id" uuid NOT NULL,
	"production_order_id" uuid NOT NULL,
	"stage_run_id" uuid NOT NULL,
	"stage_kind" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"assignment_reason" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"released_at" timestamp with time zone,
	"released_by" uuid,
	"release_reason" text,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_order_stage_attempts_known_stage" CHECK ("production_order_stage_attempts"."stage_kind" in ('sorting', 'washing', 'drying', 'folding_packaging')),
	CONSTRAINT "production_order_stage_attempts_positive_number" CHECK ("production_order_stage_attempts"."attempt_number" > 0),
	CONSTRAINT "production_order_stage_attempts_known_status" CHECK ("production_order_stage_attempts"."status" in ('assigned', 'completed', 'released')),
	CONSTRAINT "production_order_stage_attempts_known_assignment_reason" CHECK ("production_order_stage_attempts"."assignment_reason" in ('initial_schedule', 'automatic', 'manager_exact', 'manual_rebatch', 'needs_more_drying', 'rewash_required', 'sorting_incomplete', 'stage_incomplete', 'other')),
	CONSTRAINT "production_order_stage_attempts_lifecycle_valid" CHECK (("production_order_stage_attempts"."status" = 'assigned' and "production_order_stage_attempts"."completed_at" is null and "production_order_stage_attempts"."completed_by" is null and "production_order_stage_attempts"."released_at" is null and "production_order_stage_attempts"."released_by" is null and "production_order_stage_attempts"."release_reason" is null) or ("production_order_stage_attempts"."status" = 'completed' and "production_order_stage_attempts"."completed_at" is not null and "production_order_stage_attempts"."released_at" is null and "production_order_stage_attempts"."released_by" is null and "production_order_stage_attempts"."release_reason" is null) or ("production_order_stage_attempts"."status" = 'released' and "production_order_stage_attempts"."completed_at" is null and "production_order_stage_attempts"."completed_by" is null and "production_order_stage_attempts"."released_at" is not null and "production_order_stage_attempts"."released_by" is not null and "production_order_stage_attempts"."release_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_demand_id" uuid NOT NULL,
	"location_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"priority" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'eligible' NOT NULL,
	"execution_status" text DEFAULT 'unassigned' NOT NULL,
	"resolution_state" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_reason" text,
	"resolution_note" text,
	"resolution_bulk_operation_id" uuid,
	"derived_weight_lbs" numeric(12, 3) NOT NULL,
	"derived_weight_source" text DEFAULT 'external_estimate' NOT NULL,
	"bag_count" integer,
	"bag_count_source" text,
	"intake_recorded_at" timestamp with time zone,
	"intake_version" integer DEFAULT 0 NOT NULL,
	"admission_override" text,
	"admission_override_at" timestamp with time zone,
	"admission_override_by" uuid,
	"must_stay_together" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"eligible_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"pending_placement" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_orders_id_location_unique" UNIQUE("id","location_id"),
	CONSTRAINT "production_orders_positive_weight" CHECK ("production_orders"."derived_weight_lbs" > 0),
	CONSTRAINT "production_orders_must_stay_together" CHECK ("production_orders"."must_stay_together" = true),
	CONSTRAINT "production_orders_positive_version" CHECK ("production_orders"."version" > 0),
	CONSTRAINT "production_orders_bag_count_valid" CHECK ("production_orders"."bag_count" is null or "production_orders"."bag_count" >= 0),
	CONSTRAINT "production_orders_intake_version_nonnegative" CHECK ("production_orders"."intake_version" >= 0),
	CONSTRAINT "production_orders_admission_override_consistent" CHECK ((
        "production_orders"."admission_override" is null
        and "production_orders"."admission_override_at" is null
        and "production_orders"."admission_override_by" is null
      ) or (
        "production_orders"."admission_override" is not null
        and "production_orders"."admission_override" = 'released'
        and "production_orders"."admission_override_at" is not null
        and "production_orders"."admission_override_by" is not null
      )),
	CONSTRAINT "production_orders_status_valid" CHECK ("production_orders"."status" in ('release_pending', 'intake_pending', 'eligible', 'ineligible', 'scheduled', 'finished')),
	CONSTRAINT "production_orders_execution_status_valid" CHECK ("production_orders"."execution_status" in ('unassigned', 'scheduled', 'finished')),
	CONSTRAINT "production_orders_resolution_state_valid" CHECK ("production_orders"."resolution_state" in ('open', 'resolved_without_production')),
	CONSTRAINT "production_orders_resolution_reason_valid" CHECK ("production_orders"."resolution_reason" is null or "production_orders"."resolution_reason" in ('completed_outside_pressly', 'processor_not_in_use', 'duplicate_or_test', 'order_will_not_be_produced', 'other')),
	CONSTRAINT "production_orders_resolution_metadata_consistent" CHECK ((
        "production_orders"."resolution_state" = 'open'
        and "production_orders"."resolved_at" is null
        and "production_orders"."resolved_by" is null
        and "production_orders"."resolution_reason" is null
        and "production_orders"."resolution_note" is null
        and "production_orders"."resolution_bulk_operation_id" is null
      ) or (
        "production_orders"."resolution_state" = 'resolved_without_production'
        and "production_orders"."resolved_at" is not null
        and "production_orders"."resolved_by" is not null
        and "production_orders"."resolution_reason" is not null
        and btrim("production_orders"."resolution_reason") <> ''
        and (
          (
            "production_orders"."resolution_reason" <> 'other'
            and (
              "production_orders"."resolution_note" is null
              or btrim("production_orders"."resolution_note") <> ''
            )
          )
          or (
            "production_orders"."resolution_reason" = 'other'
            and "production_orders"."resolution_note" is not null
            and btrim("production_orders"."resolution_note") <> ''
          )
        )
      ))
);
--> statement-breakpoint
CREATE TABLE "production_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"production_shift_id" uuid NOT NULL,
	"schedule_run_id" uuid NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"queue_version" integer DEFAULT 1 NOT NULL,
	"planned_completion_at" timestamp with time zone NOT NULL,
	"overtime_proposal_hash" text,
	"overtime_queue_version" integer,
	"overtime_acknowledged_by" uuid,
	"overtime_acknowledged_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_runs_id_location_unique" UNIQUE("id","location_id"),
	CONSTRAINT "production_runs_positive_version" CHECK ("production_runs"."version" > 0),
	CONSTRAINT "production_runs_positive_queue_version" CHECK ("production_runs"."queue_version" > 0),
	CONSTRAINT "production_runs_current_status_valid" CHECK ("production_runs"."status" in ('started', 'completed')),
	CONSTRAINT "production_runs_lifecycle_timestamps_valid" CHECK ("production_runs"."started_at" is not null and (("production_runs"."status" = 'started' and "production_runs"."completed_at" is null) or ("production_runs"."status" = 'completed' and "production_runs"."completed_at" is not null))),
	CONSTRAINT "production_runs_overtime_acknowledgement_paired" CHECK (("production_runs"."overtime_proposal_hash" is null and "production_runs"."overtime_queue_version" is null and "production_runs"."overtime_acknowledged_by" is null and "production_runs"."overtime_acknowledged_at" is null) or ("production_runs"."overtime_proposal_hash" is not null and "production_runs"."overtime_queue_version" is not null and "production_runs"."overtime_queue_version" > 0 and "production_runs"."overtime_acknowledged_by" is not null and "production_runs"."overtime_acknowledged_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "production_shift_selected_orders" (
	"production_shift_id" uuid NOT NULL,
	"location_id" text NOT NULL,
	"production_order_id" uuid NOT NULL,
	"selected_by" uuid NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_shift_selected_orders_pk" PRIMARY KEY("production_shift_id","production_order_id")
);
--> statement-breakpoint
CREATE TABLE "production_shift_selections" (
	"production_shift_id" uuid PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"selected_by" uuid NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_shift_selections_shift_location_unique" UNIQUE("production_shift_id","location_id"),
	CONSTRAINT "production_shift_selections_positive_version" CHECK ("production_shift_selections"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_folder_count" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_shifts_id_location_unique" UNIQUE("id","location_id"),
	CONSTRAINT "production_shifts_valid_window" CHECK ("production_shifts"."ends_at" > "production_shifts"."starts_at"),
	CONSTRAINT "production_shifts_positive_folders" CHECK ("production_shifts"."effective_folder_count" > 0),
	CONSTRAINT "production_shifts_positive_version" CHECK ("production_shifts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "schedule_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"production_shift_id" uuid NOT NULL,
	"scheduler_config_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"input_snapshot_hash" text NOT NULL,
	"output_plan" jsonb NOT NULL,
	"output_plan_hash" text NOT NULL,
	"algorithm_version" text NOT NULL,
	"pulse_capacity_lbs" numeric(12, 3) NOT NULL,
	"batch_count" integer NOT NULL,
	"makespan_minutes" integer NOT NULL,
	"planned_completion_at" timestamp with time zone NOT NULL,
	"warnings_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"acknowledged_warning_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "schedule_runs_id_location_unique" UNIQUE("id","location_id"),
	CONSTRAINT "schedule_runs_nonnegative_forecasts" CHECK ("schedule_runs"."batch_count" >= 0 and "schedule_runs"."makespan_minutes" >= 0 and "schedule_runs"."pulse_capacity_lbs" > 0),
	CONSTRAINT "schedule_runs_known_status" CHECK ("schedule_runs"."status" in ('draft', 'accepted', 'superseded', 'rejected')),
	CONSTRAINT "schedule_runs_status_timestamps_valid" CHECK (("schedule_runs"."status" = 'accepted' and "schedule_runs"."accepted_at" is not null and "schedule_runs"."accepted_by" is not null and "schedule_runs"."superseded_at" is null) or ("schedule_runs"."status" = 'draft' and "schedule_runs"."accepted_at" is null and "schedule_runs"."accepted_by" is null and "schedule_runs"."superseded_at" is null) or ("schedule_runs"."status" in ('superseded', 'rejected')))
);
--> statement-breakpoint
CREATE TABLE "scheduler_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"pulse_minutes" integer NOT NULL,
	"fold_lbs_per_folder_minute" numeric(12, 3) NOT NULL,
	"algorithm_version" text DEFAULT 'fixed-pulse-ffd-v1' NOT NULL,
	"version" integer NOT NULL,
	"stage_fit_assertion" jsonb NOT NULL,
	"asserted_by" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduler_configs_id_location_unique" UNIQUE("id","location_id"),
	CONSTRAINT "scheduler_configs_positive_pulse" CHECK ("scheduler_configs"."pulse_minutes" > 0),
	CONSTRAINT "scheduler_configs_positive_fold_rate" CHECK ("scheduler_configs"."fold_lbs_per_folder_minute" > 0)
);
--> statement-breakpoint
CREATE TABLE "source_location_bindings" (
	"source" text NOT NULL,
	"external_location_id" text NOT NULL,
	"location_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_location_bindings_source_external_location_id_pk" PRIMARY KEY("source","external_location_id")
);
--> statement-breakpoint
CREATE TABLE "stage_machine_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"stage_run_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"planned_start_at" timestamp with time zone NOT NULL,
	"planned_end_at" timestamp with time zone NOT NULL,
	"actual_start_at" timestamp with time zone,
	"actual_end_at" timestamp with time zone,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stage_machine_assignments_window_valid" CHECK ("stage_machine_assignments"."planned_end_at" > "stage_machine_assignments"."planned_start_at")
);
--> statement-breakpoint
CREATE TABLE "stage_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"production_batch_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"stage_kind" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"planned_start_at" timestamp with time zone NOT NULL,
	"planned_end_at" timestamp with time zone NOT NULL,
	"actual_start_at" timestamp with time zone,
	"actual_end_at" timestamp with time zone,
	"actual_start_provenance" "stage_boundary_provenance" DEFAULT 'not_recorded' NOT NULL,
	"actual_end_provenance" "stage_boundary_provenance" DEFAULT 'not_recorded' NOT NULL,
	"started_by" uuid,
	"completed_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stage_runs_id_location_unique" UNIQUE("id","location_id"),
	CONSTRAINT "stage_runs_planned_window_valid" CHECK ("stage_runs"."planned_end_at" > "stage_runs"."planned_start_at"),
	CONSTRAINT "stage_runs_known_stage" CHECK ("stage_runs"."stage_kind" in ('sorting', 'washing', 'drying', 'folding_packaging')),
	CONSTRAINT "stage_runs_actual_start_provenance_valid" CHECK (("stage_runs"."actual_start_at" is null and "stage_runs"."actual_start_provenance" = 'not_recorded') or ("stage_runs"."actual_start_at" is not null and "stage_runs"."actual_start_provenance" in ('live_observed', 'operator_reported'))),
	CONSTRAINT "stage_runs_actual_end_provenance_valid" CHECK (("stage_runs"."actual_end_at" is null and "stage_runs"."actual_end_provenance" = 'not_recorded') or ("stage_runs"."actual_end_at" is not null and "stage_runs"."actual_end_provenance" in ('live_observed', 'operator_reported'))),
	CONSTRAINT "stage_runs_actual_window_valid" CHECK ("stage_runs"."actual_start_at" is null or "stage_runs"."actual_end_at" is null or "stage_runs"."actual_end_at" >= "stage_runs"."actual_start_at")
);
--> statement-breakpoint
CREATE TABLE "production_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "production_stations_id_location_unique" UNIQUE("id","location_id"),
	CONSTRAINT "production_stations_known_kind" CHECK ("production_stations"."kind" in ('sorting', 'washing', 'drying', 'folding_packaging'))
);
--> statement-breakpoint
CREATE TABLE "user_command_receipts" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"command_hash" text NOT NULL,
	"origin" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"result_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_command_receipts_command_hash_shape" CHECK ("user_command_receipts"."command_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "user_command_receipts_actor_kind_valid" CHECK ("user_command_receipts"."actor_kind" in ('human', 'service', 'system')),
	CONSTRAINT "user_command_receipts_context_present" CHECK (length(trim("user_command_receipts"."origin")) > 0 and length(trim("user_command_receipts"."actor_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_kind" text NOT NULL,
	"granted" boolean NOT NULL,
	"source" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"source_payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_consents_hash_shape" CHECK ("user_consents"."source_payload_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "user_duplicate_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"candidate_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_duplicate_candidates_distinct_users" CHECK ("user_duplicate_candidates"."user_id" <> "user_duplicate_candidates"."candidate_user_id"),
	CONSTRAINT "user_duplicate_candidates_status_valid" CHECK ("user_duplicate_candidates"."status" in ('open', 'dismissed', 'merged')),
	CONSTRAINT "user_duplicate_candidates_resolution_consistent" CHECK (("user_duplicate_candidates"."status" = 'open' and "user_duplicate_candidates"."resolved_at" is null) or ("user_duplicate_candidates"."status" <> 'open' and "user_duplicate_candidates"."resolved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "user_field_authorities" (
	"user_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"authority" text NOT NULL,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_field_authorities_user_id_field_name_pk" PRIMARY KEY("user_id","field_name"),
	CONSTRAINT "user_field_authorities_valid" CHECK (("user_field_authorities"."authority" = 'pressly' and "user_field_authorities"."source" is null) or ("user_field_authorities"."authority" = 'source' and "user_field_authorities"."source" is not null))
);
--> statement-breakpoint
CREATE TABLE "user_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_user_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_source_snapshots" (
	"source_link_id" uuid PRIMARY KEY NOT NULL,
	"source_revision_at" timestamp with time zone NOT NULL,
	"source_revision_hash" text NOT NULL,
	"adapter_version" text NOT NULL,
	"normalized_payload_json" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_source_snapshots_hash_shape" CHECK ("user_source_snapshots"."source_revision_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"first_name" text,
	"last_name" text,
	"business_name" text,
	"phone" text,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_id_business_unique" UNIQUE("id","business_id"),
	CONSTRAINT "users_positive_version" CHECK ("users"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"source_location_id" text,
	"source_occurred_at" timestamp with time zone,
	"payload_json" jsonb,
	"payload_hash" text,
	"raw_body_sha256" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_attempts_nonnegative" CHECK ("webhook_events"."attempts" >= 0),
	CONSTRAINT "webhook_events_known_status" CHECK ("webhook_events"."status" in ('pending', 'processing', 'processed', 'dead'))
);
--> statement-breakpoint
CREATE TABLE "webhook_receipt_quarantine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"raw_body_sha256" text NOT NULL,
	"adapter_version" text NOT NULL,
	"event_type" text,
	"normalization_outcome" text NOT NULL,
	"normalization_error_code" text,
	"payload_ciphertext" text NOT NULL,
	"webhook_event_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"linked_at" timestamp with time zone,
	CONSTRAINT "webhook_receipt_quarantine_outcome_valid" CHECK ("webhook_receipt_quarantine"."normalization_outcome" in ('accepted', 'rejected')),
	CONSTRAINT "webhook_receipt_quarantine_error_consistent" CHECK (("webhook_receipt_quarantine"."normalization_outcome" = 'accepted' and "webhook_receipt_quarantine"."normalization_error_code" is null) or ("webhook_receipt_quarantine"."normalization_outcome" = 'rejected' and "webhook_receipt_quarantine"."normalization_error_code" is not null)),
	CONSTRAINT "webhook_receipt_quarantine_link_consistent" CHECK (("webhook_receipt_quarantine"."webhook_event_id" is null and "webhook_receipt_quarantine"."linked_at" is null) or ("webhook_receipt_quarantine"."webhook_event_id" is not null and "webhook_receipt_quarantine"."linked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "work_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"expected_version" integer,
	"idempotency_key" text NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workforce_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"email_normalized" text NOT NULL,
	"display_name" text NOT NULL,
	"intended_role" text NOT NULL,
	"intended_location_id" text,
	"state" "workforce_invitation_state" DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_identity_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_identity_id" uuid,
	"expired_at" timestamp with time zone,
	"created_by_identity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workforce_invitations_positive_version" CHECK ("workforce_invitations"."version" > 0),
	CONSTRAINT "workforce_invitations_email_normalized" CHECK ("workforce_invitations"."email_normalized" = lower(btrim("workforce_invitations"."email_normalized")) and length("workforce_invitations"."email_normalized") > 3),
	CONSTRAINT "workforce_invitations_token_hash_shape" CHECK ("workforce_invitations"."token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "workforce_invitations_role_scope_valid" CHECK (("workforce_invitations"."intended_role" in ('owner', 'manager') and ("workforce_invitations"."intended_location_id" is null or length(btrim("workforce_invitations"."intended_location_id")) > 0)) or ("workforce_invitations"."intended_role" = 'operator' and "workforce_invitations"."intended_location_id" is not null and length(btrim("workforce_invitations"."intended_location_id")) > 0)),
	CONSTRAINT "workforce_invitations_expiry_valid" CHECK ("workforce_invitations"."expires_at" > "workforce_invitations"."created_at"),
	CONSTRAINT "workforce_invitations_state_timestamps_valid" CHECK (("workforce_invitations"."state" = 'pending' and "workforce_invitations"."accepted_at" is null and "workforce_invitations"."accepted_by_identity_id" is null and "workforce_invitations"."revoked_at" is null and "workforce_invitations"."revoked_by_identity_id" is null and "workforce_invitations"."expired_at" is null) or ("workforce_invitations"."state" = 'accepted' and "workforce_invitations"."accepted_at" is not null and "workforce_invitations"."accepted_by_identity_id" is not null and "workforce_invitations"."revoked_at" is null and "workforce_invitations"."revoked_by_identity_id" is null and "workforce_invitations"."expired_at" is null) or ("workforce_invitations"."state" = 'revoked' and "workforce_invitations"."accepted_at" is null and "workforce_invitations"."accepted_by_identity_id" is null and "workforce_invitations"."revoked_at" is not null and "workforce_invitations"."revoked_by_identity_id" is not null and "workforce_invitations"."expired_at" is null) or ("workforce_invitations"."state" = 'expired' and "workforce_invitations"."accepted_at" is null and "workforce_invitations"."accepted_by_identity_id" is null and "workforce_invitations"."revoked_at" is null and "workforce_invitations"."revoked_by_identity_id" is null and "workforce_invitations"."expired_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "workforce_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"state" "workforce_membership_state" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspended_by_identity_id" uuid,
	"suspension_reason" text,
	"ended_at" timestamp with time zone,
	"ended_by_identity_id" uuid,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workforce_memberships_id_business_identity_unique" UNIQUE("id","business_id","identity_id"),
	CONSTRAINT "workforce_memberships_positive_version" CHECK ("workforce_memberships"."version" > 0),
	CONSTRAINT "workforce_memberships_suspension_tuple" CHECK (("workforce_memberships"."suspended_at" is null and "workforce_memberships"."suspended_by_identity_id" is null and "workforce_memberships"."suspension_reason" is null) or ("workforce_memberships"."suspended_at" is not null and "workforce_memberships"."suspended_by_identity_id" is not null and length(btrim("workforce_memberships"."suspension_reason")) > 0)),
	CONSTRAINT "workforce_memberships_end_tuple" CHECK (("workforce_memberships"."ended_at" is null and "workforce_memberships"."ended_by_identity_id" is null and "workforce_memberships"."end_reason" is null) or ("workforce_memberships"."ended_at" is not null and "workforce_memberships"."ended_by_identity_id" is not null and length(btrim("workforce_memberships"."end_reason")) > 0)),
	CONSTRAINT "workforce_memberships_state_timestamps_valid" CHECK (("workforce_memberships"."state" = 'active' and "workforce_memberships"."suspended_at" is null and "workforce_memberships"."ended_at" is null) or ("workforce_memberships"."state" = 'suspended' and "workforce_memberships"."suspended_at" is not null and "workforce_memberships"."ended_at" is null) or ("workforce_memberships"."state" = 'ended' and "workforce_memberships"."ended_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "access_production_locations" ADD CONSTRAINT "access_production_locations_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_grants" ADD CONSTRAINT "auth_access_grants_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_grants" ADD CONSTRAINT "auth_access_grants_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_grants" ADD CONSTRAINT "auth_access_grants_revoked_by_identity_id_auth_identities_id_fk" FOREIGN KEY ("revoked_by_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_grants" ADD CONSTRAINT "auth_access_grants_created_by_identity_id_auth_identities_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_grants" ADD CONSTRAINT "auth_access_grants_membership_business_identity_fk" FOREIGN KEY ("membership_id","business_id","identity_id") REFERENCES "public"."workforce_memberships"("id","business_id","identity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_grants" ADD CONSTRAINT "auth_access_grants_location_business_fk" FOREIGN KEY ("location_id","business_id") REFERENCES "public"."access_production_locations"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_audit_events" ADD CONSTRAINT "auth_audit_events_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_audit_events" ADD CONSTRAINT "auth_audit_events_principal_identity_id_auth_identities_id_fk" FOREIGN KEY ("principal_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_command_receipts" ADD CONSTRAINT "auth_command_receipts_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_command_receipts" ADD CONSTRAINT "auth_command_receipts_actor_identity_id_auth_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_lifecycle_transitions" ADD CONSTRAINT "auth_lifecycle_transitions_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_lifecycle_transitions" ADD CONSTRAINT "auth_lifecycle_transitions_actor_identity_id_auth_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_login_attempts" ADD CONSTRAINT "auth_login_attempts_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_mfa_challenges" ADD CONSTRAINT "auth_mfa_challenges_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_mfa_credentials" ADD CONSTRAINT "auth_mfa_credentials_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_mfa_recovery_codes" ADD CONSTRAINT "auth_mfa_recovery_codes_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_password_credentials" ADD CONSTRAINT "auth_password_credentials_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_bags" ADD CONSTRAINT "production_bags_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_machines" ADD CONSTRAINT "production_machines_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_machines" ADD CONSTRAINT "production_machines_station_location_fk" FOREIGN KEY ("station_id","location_id") REFERENCES "public"."production_stations"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_command_receipts" ADD CONSTRAINT "order_command_receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_demands" ADD CONSTRAINT "order_demands_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_order_business_fk" FOREIGN KEY ("order_id","business_id") REFERENCES "public"."orders"("id","business_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_business_fk" FOREIGN KEY ("order_id","business_id") REFERENCES "public"."orders"("id","business_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_outbox_events" ADD CONSTRAINT "order_outbox_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_outbox_events" ADD CONSTRAINT "order_outbox_events_fulfillment_id_order_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."order_fulfillments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_customer_refs" ADD CONSTRAINT "order_source_customer_refs_order_source_link_id_order_source_links_id_fk" FOREIGN KEY ("order_source_link_id") REFERENCES "public"."order_source_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_links" ADD CONSTRAINT "order_source_links_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_proposal_resolutions" ADD CONSTRAINT "order_source_proposal_resolutions_proposal_id_order_source_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."order_source_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_proposal_resolutions" ADD CONSTRAINT "order_source_proposal_resolutions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_proposal_resolutions" ADD CONSTRAINT "order_source_proposal_resolutions_fulfillment_id_order_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."order_fulfillments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_proposal_transitions" ADD CONSTRAINT "order_source_proposal_transitions_proposal_id_order_source_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."order_source_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_snapshots" ADD CONSTRAINT "order_source_snapshots_source_link_id_order_source_links_id_fk" FOREIGN KEY ("source_link_id") REFERENCES "public"."order_source_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_terminal_tombstones" ADD CONSTRAINT "order_source_terminal_tombstones_proposal_id_order_source_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."order_source_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_change_events" ADD CONSTRAINT "pricing_change_events_old_pricing_set_id_pricing_sets_id_fk" FOREIGN KEY ("old_pricing_set_id") REFERENCES "public"."pricing_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_change_events" ADD CONSTRAINT "pricing_change_events_new_pricing_set_id_pricing_sets_id_fk" FOREIGN KEY ("new_pricing_set_id") REFERENCES "public"."pricing_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_items" ADD CONSTRAINT "pricing_items_pricing_set_id_pricing_sets_id_fk" FOREIGN KEY ("pricing_set_id") REFERENCES "public"."pricing_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_sets" ADD CONSTRAINT "pricing_sets_service_id_pricing_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."pricing_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_batch_location_fk" FOREIGN KEY ("production_batch_id","location_id") REFERENCES "public"."production_batches"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_order_location_fk" FOREIGN KEY ("production_order_id","location_id") REFERENCES "public"."production_orders"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_run_location_fk" FOREIGN KEY ("production_run_id","location_id") REFERENCES "public"."production_runs"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_stage_attempts" ADD CONSTRAINT "production_order_stage_attempts_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_stage_attempts" ADD CONSTRAINT "production_order_stage_attempts_run_location_fk" FOREIGN KEY ("production_run_id","location_id") REFERENCES "public"."production_runs"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_stage_attempts" ADD CONSTRAINT "production_order_stage_attempts_order_location_fk" FOREIGN KEY ("production_order_id","location_id") REFERENCES "public"."production_orders"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_stage_attempts" ADD CONSTRAINT "production_order_stage_attempts_stage_location_fk" FOREIGN KEY ("stage_run_id","location_id") REFERENCES "public"."stage_runs"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_order_demand_location_fk" FOREIGN KEY ("order_demand_id","location_id") REFERENCES "public"."order_demands"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_shift_location_fk" FOREIGN KEY ("production_shift_id","location_id") REFERENCES "public"."production_shifts"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_schedule_location_fk" FOREIGN KEY ("schedule_run_id","location_id") REFERENCES "public"."schedule_runs"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shift_selected_orders" ADD CONSTRAINT "production_shift_selected_orders_selection_fk" FOREIGN KEY ("production_shift_id","location_id") REFERENCES "public"."production_shift_selections"("production_shift_id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shift_selected_orders" ADD CONSTRAINT "production_shift_selected_orders_order_location_fk" FOREIGN KEY ("production_order_id","location_id") REFERENCES "public"."production_orders"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shift_selections" ADD CONSTRAINT "production_shift_selections_shift_location_fk" FOREIGN KEY ("production_shift_id","location_id") REFERENCES "public"."production_shifts"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shifts" ADD CONSTRAINT "production_shifts_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_shift_location_fk" FOREIGN KEY ("production_shift_id","location_id") REFERENCES "public"."production_shifts"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_config_location_fk" FOREIGN KEY ("scheduler_config_id","location_id") REFERENCES "public"."scheduler_configs"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduler_configs" ADD CONSTRAINT "scheduler_configs_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_machine_assignments" ADD CONSTRAINT "stage_machine_assignments_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_machine_assignments" ADD CONSTRAINT "stage_machine_assignments_stage_location_fk" FOREIGN KEY ("stage_run_id","location_id") REFERENCES "public"."stage_runs"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_machine_assignments" ADD CONSTRAINT "stage_machine_assignments_machine_location_fk" FOREIGN KEY ("machine_id","location_id") REFERENCES "public"."production_machines"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_batch_location_fk" FOREIGN KEY ("production_batch_id","location_id") REFERENCES "public"."production_batches"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_station_location_fk" FOREIGN KEY ("station_id","location_id") REFERENCES "public"."production_stations"("id","location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stations" ADD CONSTRAINT "production_stations_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_command_receipts" ADD CONSTRAINT "user_command_receipts_user_business_fk" FOREIGN KEY ("user_id","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_duplicate_candidates" ADD CONSTRAINT "user_duplicate_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_duplicate_candidates" ADD CONSTRAINT "user_duplicate_candidates_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_field_authorities" ADD CONSTRAINT "user_field_authorities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_source_links" ADD CONSTRAINT "user_source_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_source_snapshots" ADD CONSTRAINT "user_source_snapshots_source_link_id_user_source_links_id_fk" FOREIGN KEY ("source_link_id") REFERENCES "public"."user_source_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_receipt_quarantine" ADD CONSTRAINT "webhook_receipt_quarantine_webhook_event_id_webhook_events_id_fk" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."webhook_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_events" ADD CONSTRAINT "work_events_location_id_production_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."production_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_invitations" ADD CONSTRAINT "workforce_invitations_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_invitations" ADD CONSTRAINT "workforce_invitations_accepted_by_identity_id_auth_identities_id_fk" FOREIGN KEY ("accepted_by_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_invitations" ADD CONSTRAINT "workforce_invitations_revoked_by_identity_id_auth_identities_id_fk" FOREIGN KEY ("revoked_by_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_invitations" ADD CONSTRAINT "workforce_invitations_created_by_identity_id_auth_identities_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_invitations" ADD CONSTRAINT "workforce_invitations_location_business_fk" FOREIGN KEY ("intended_location_id","business_id") REFERENCES "public"."access_production_locations"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_memberships" ADD CONSTRAINT "workforce_memberships_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_memberships" ADD CONSTRAINT "workforce_memberships_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_memberships" ADD CONSTRAINT "workforce_memberships_suspended_by_identity_id_auth_identities_id_fk" FOREIGN KEY ("suspended_by_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_memberships" ADD CONSTRAINT "workforce_memberships_ended_by_identity_id_auth_identities_id_fk" FOREIGN KEY ("ended_by_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_access_grants_id_business_identity_unique" ON "auth_access_grants" USING btree ("id","business_id","identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_access_grants_one_active_scope_unique" ON "auth_access_grants" USING btree ("membership_id","role","scope_kind","scope_id","scope_resource_type") WHERE "auth_access_grants"."state" = 'active';--> statement-breakpoint
CREATE INDEX "auth_access_grants_identity_state_idx" ON "auth_access_grants" USING btree ("identity_id","state");--> statement-breakpoint
CREATE INDEX "auth_access_grants_business_scope_idx" ON "auth_access_grants" USING btree ("business_id","scope_kind","scope_id","state");--> statement-breakpoint
CREATE INDEX "auth_command_receipts_aggregate_idx" ON "auth_command_receipts" USING btree ("aggregate_kind","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_lifecycle_transitions_version_unique" ON "auth_lifecycle_transitions" USING btree ("aggregate_kind","aggregate_id","aggregate_version");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_lifecycle_transitions_idempotency_unique" ON "auth_lifecycle_transitions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "auth_lifecycle_transitions_aggregate_idx" ON "auth_lifecycle_transitions" USING btree ("aggregate_kind","aggregate_id","occurred_at");--> statement-breakpoint
CREATE INDEX "auth_mfa_challenges_identity_idx" ON "auth_mfa_challenges" USING btree ("identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_mfa_credentials_identity_unique" ON "auth_mfa_credentials" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "auth_mfa_recovery_codes_identity_idx" ON "auth_mfa_recovery_codes" USING btree ("identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_password_credentials_identity_unique" ON "auth_password_credentials" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_identity_idx" ON "auth_sessions" USING btree ("identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_bags_order_index_unique" ON "production_bags" USING btree ("production_order_id","bag_index");--> statement-breakpoint
CREATE UNIQUE INDEX "business_accounts_slug_unique" ON "business_accounts" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "production_machines_label_unique" ON "production_machines" USING btree ("station_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "order_demands_fulfillment_unique" ON "order_demands" USING btree ("fulfillment_id");--> statement-breakpoint
CREATE INDEX "order_demands_location_phase_idx" ON "order_demands" USING btree ("location_id","phase");--> statement-breakpoint
CREATE UNIQUE INDEX "order_fulfillments_id_business_unique" ON "order_fulfillments" USING btree ("id","business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_fulfillments_order_type_unique" ON "order_fulfillments" USING btree ("order_id","type_code");--> statement-breakpoint
CREATE INDEX "order_fulfillments_location_release_idx" ON "order_fulfillments" USING btree ("location_id","release_state");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_id_business_unique" ON "order_items" USING btree ("id","business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_line_unique" ON "order_items" USING btree ("order_id","line_key");--> statement-breakpoint
CREATE UNIQUE INDEX "order_outbox_events_version_unique" ON "order_outbox_events" USING btree ("order_id","fulfillment_id","aggregate_version","event_type");--> statement-breakpoint
CREATE INDEX "order_outbox_events_claimable_idx" ON "order_outbox_events" USING btree ("status","available_at","lease_expires_at");--> statement-breakpoint
CREATE INDEX "order_source_customer_refs_external_idx" ON "order_source_customer_refs" USING btree ("external_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_links_source_identity_unique" ON "order_source_links" USING btree ("source","external_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_links_id_identity_unique" ON "order_source_links" USING btree ("id","source","external_order_id");--> statement-breakpoint
CREATE INDEX "order_source_links_order_idx" ON "order_source_links" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_proposal_resolutions_idempotency_unique" ON "order_source_proposal_resolutions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "order_source_proposal_resolutions_order_idx" ON "order_source_proposal_resolutions" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_proposal_transitions_version_unique" ON "order_source_proposal_transitions" USING btree ("proposal_id","proposal_version");--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_proposal_transitions_idempotency_unique" ON "order_source_proposal_transitions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "order_source_proposal_transitions_proposal_occurred_idx" ON "order_source_proposal_transitions" USING btree ("proposal_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_proposals_source_identity_unique" ON "order_source_proposals" USING btree ("source","external_order_id");--> statement-breakpoint
CREATE INDEX "order_source_proposals_location_observed_idx" ON "order_source_proposals" USING btree ("location_id","observed_at","id");--> statement-breakpoint
CREATE INDEX "order_source_proposals_location_state_observed_idx" ON "order_source_proposals" USING btree ("location_id","state","observed_at","id");--> statement-breakpoint
CREATE INDEX "order_source_snapshots_revision_idx" ON "order_source_snapshots" USING btree ("source_revision_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_terminal_tombstones_identity_unique" ON "order_source_terminal_tombstones" USING btree ("source","external_order_id");--> statement-breakpoint
CREATE INDEX "order_source_terminal_tombstones_proposal_idx" ON "order_source_terminal_tombstones" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "orders_business_due_state_idx" ON "orders" USING btree ("business_id","due_at","state");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_due_state_idx" ON "orders" USING btree ("due_at","state");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_items_code_per_set_unique" ON "pricing_items" USING btree ("pricing_set_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_sets_active_service_unique" ON "pricing_sets" USING btree ("service_id") WHERE "pricing_sets"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "production_batch_orders_active_unique" ON "production_batch_orders" USING btree ("production_order_id") WHERE "production_batch_orders"."active" = true;--> statement-breakpoint
CREATE INDEX "production_batch_orders_order_history_idx" ON "production_batch_orders" USING btree ("production_order_id","placed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "production_batches_sequence_unique" ON "production_batches" USING btree ("production_run_id","sequence_index");--> statement-breakpoint
CREATE UNIQUE INDEX "production_order_stage_attempts_order_stage_number_unique" ON "production_order_stage_attempts" USING btree ("production_order_id","stage_kind","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "production_order_stage_attempts_one_assigned_unique" ON "production_order_stage_attempts" USING btree ("production_order_id","stage_kind") WHERE "production_order_stage_attempts"."status" = 'assigned';--> statement-breakpoint
CREATE INDEX "production_order_stage_attempts_stage_idx" ON "production_order_stage_attempts" USING btree ("stage_run_id","status");--> statement-breakpoint
CREATE INDEX "production_order_stage_attempts_order_idx" ON "production_order_stage_attempts" USING btree ("production_order_id","assigned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "production_orders_order_demand_unique" ON "production_orders" USING btree ("order_demand_id");--> statement-breakpoint
CREATE INDEX "production_orders_location_status_idx" ON "production_orders" USING btree ("location_id","status");--> statement-breakpoint
CREATE INDEX "production_orders_location_execution_status_idx" ON "production_orders" USING btree ("location_id","execution_status");--> statement-breakpoint
CREATE INDEX "production_orders_location_due_id_idx" ON "production_orders" USING btree ("location_id","due_at","id");--> statement-breakpoint
CREATE INDEX "production_orders_location_resolution_due_id_idx" ON "production_orders" USING btree ("location_id","resolution_state","due_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_runs_schedule_unique" ON "production_runs" USING btree ("schedule_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_runs_shift_unique" ON "production_runs" USING btree ("production_shift_id");--> statement-breakpoint
CREATE INDEX "production_runs_location_created_id_idx" ON "production_runs" USING btree ("location_id","created_at","id");--> statement-breakpoint
CREATE INDEX "production_shift_selected_orders_location_shift_idx" ON "production_shift_selected_orders" USING btree ("location_id","production_shift_id");--> statement-breakpoint
CREATE INDEX "schedule_runs_location_created_id_idx" ON "schedule_runs" USING btree ("location_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_runs_one_current_per_shift_unique" ON "schedule_runs" USING btree ("production_shift_id") WHERE "schedule_runs"."status" in ('draft', 'accepted');--> statement-breakpoint
CREATE UNIQUE INDEX "scheduler_configs_location_version_unique" ON "scheduler_configs" USING btree ("location_id","version");--> statement-breakpoint
CREATE INDEX "source_location_bindings_location_idx" ON "source_location_bindings" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_machine_assignments_stage_machine_unique" ON "stage_machine_assignments" USING btree ("stage_run_id","machine_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_runs_batch_stage_unique" ON "stage_runs" USING btree ("production_batch_id","stage_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_runs_one_active_station_unique" ON "stage_runs" USING btree ("station_id") WHERE "stage_runs"."status" = 'started';--> statement-breakpoint
CREATE UNIQUE INDEX "production_stations_kind_unique" ON "production_stations" USING btree ("location_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "user_consents_idempotency_unique" ON "user_consents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "user_consents_user_observed_idx" ON "user_consents" USING btree ("user_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_duplicate_candidates_pair_reason_unique" ON "user_duplicate_candidates" USING btree ("user_id","candidate_user_id","reason");--> statement-breakpoint
CREATE UNIQUE INDEX "user_source_links_source_identity_unique" ON "user_source_links" USING btree ("source","external_user_id");--> statement-breakpoint
CREATE INDEX "user_source_links_user_idx" ON "user_source_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_source_snapshots_revision_idx" ON "user_source_snapshots" USING btree ("source_revision_at");--> statement-breakpoint
CREATE INDEX "users_business_active_idx" ON "users" USING btree ("business_id","active");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_dedupe_unique" ON "webhook_events" USING btree ("source","dedupe_key");--> statement-breakpoint
CREATE INDEX "webhook_events_claimable_idx" ON "webhook_events" USING btree ("status","available_at","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_receipt_quarantine_body_version_unique" ON "webhook_receipt_quarantine" USING btree ("source","raw_body_sha256","adapter_version");--> statement-breakpoint
CREATE INDEX "webhook_receipt_quarantine_expiry_idx" ON "webhook_receipt_quarantine" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "webhook_receipt_quarantine_event_idx" ON "webhook_receipt_quarantine" USING btree ("webhook_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_events_idempotency_unique" ON "work_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "work_events_entity_idx" ON "work_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "work_events_location_created_id_idx" ON "work_events" USING btree ("location_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_invitations_token_hash_unique" ON "workforce_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_invitations_one_pending_email_unique" ON "workforce_invitations" USING btree ("business_id","email_normalized") WHERE "workforce_invitations"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "workforce_invitations_business_state_idx" ON "workforce_invitations" USING btree ("business_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_memberships_one_current_per_identity_unique" ON "workforce_memberships" USING btree ("business_id","identity_id") WHERE "workforce_memberships"."state" in ('active', 'suspended');--> statement-breakpoint
CREATE INDEX "workforce_memberships_business_state_idx" ON "workforce_memberships" USING btree ("business_id","state","created_at");
