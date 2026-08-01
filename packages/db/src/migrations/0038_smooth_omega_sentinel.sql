CREATE TYPE "public"."auth_access_grant_state" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."workforce_invitation_state" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."workforce_membership_state" AS ENUM('active', 'suspended', 'ended');--> statement-breakpoint
ALTER TYPE "public"."auth_role" ADD VALUE 'manager' BEFORE 'admin';--> statement-breakpoint
ALTER TYPE "public"."auth_scope_kind" ADD VALUE 'business' BEFORE 'location';--> statement-breakpoint
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
	CONSTRAINT "workforce_memberships_positive_version" CHECK ("workforce_memberships"."version" > 0),
	CONSTRAINT "workforce_memberships_suspension_tuple" CHECK (("workforce_memberships"."suspended_at" is null and "workforce_memberships"."suspended_by_identity_id" is null and "workforce_memberships"."suspension_reason" is null) or ("workforce_memberships"."suspended_at" is not null and "workforce_memberships"."suspended_by_identity_id" is not null and length(btrim("workforce_memberships"."suspension_reason")) > 0)),
	CONSTRAINT "workforce_memberships_end_tuple" CHECK (("workforce_memberships"."ended_at" is null and "workforce_memberships"."ended_by_identity_id" is null and "workforce_memberships"."end_reason" is null) or ("workforce_memberships"."ended_at" is not null and "workforce_memberships"."ended_by_identity_id" is not null and length(btrim("workforce_memberships"."end_reason")) > 0)),
	CONSTRAINT "workforce_memberships_state_timestamps_valid" CHECK (("workforce_memberships"."state" = 'active' and "workforce_memberships"."suspended_at" is null and "workforce_memberships"."ended_at" is null) or ("workforce_memberships"."state" = 'suspended' and "workforce_memberships"."suspended_at" is not null and "workforce_memberships"."ended_at" is null) or ("workforce_memberships"."state" = 'ended' and "workforce_memberships"."ended_at" is not null))
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
-- Stable pre-launch account used only to preserve the existing single-business
-- dataset. Application commands must supply business_id after this migration;
-- none of the ancestry columns below retain a database default.
INSERT INTO "business_accounts" (
	"id",
	"slug",
	"display_name"
) VALUES (
	'00000000-0000-4000-8000-000000000100',
	'pressly-one',
	'Pressly One'
);--> statement-breakpoint
ALTER TABLE "order_fulfillments" DROP CONSTRAINT "order_fulfillments_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_command_receipts" DROP CONSTRAINT "user_command_receipts_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "auth_audit_events" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "production_locations" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "order_fulfillments" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "user_command_receipts" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "production_locations"
SET "business_id" = '00000000-0000-4000-8000-000000000100';--> statement-breakpoint
UPDATE "users"
SET "business_id" = '00000000-0000-4000-8000-000000000100';--> statement-breakpoint
UPDATE "orders"
SET "business_id" = '00000000-0000-4000-8000-000000000100';--> statement-breakpoint
UPDATE "order_items" AS item
SET "business_id" = parent."business_id"
FROM "orders" AS parent
WHERE parent."id" = item."order_id";--> statement-breakpoint
UPDATE "order_fulfillments" AS fulfillment
SET "business_id" = parent."business_id"
FROM "orders" AS parent
WHERE parent."id" = fulfillment."order_id";--> statement-breakpoint
UPDATE "user_command_receipts" AS receipt
SET "business_id" = parent."business_id"
FROM "users" AS parent
WHERE parent."id" = receipt."user_id";--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "production_locations"
		WHERE "business_id" IS NULL
	) OR EXISTS (
		SELECT 1
		FROM "users"
		WHERE "business_id" IS NULL
	) OR EXISTS (
		SELECT 1
		FROM "orders"
		WHERE "business_id" IS NULL
	) OR EXISTS (
		SELECT 1
		FROM "order_items"
		WHERE "business_id" IS NULL
	) OR EXISTS (
		SELECT 1
		FROM "order_fulfillments"
		WHERE "business_id" IS NULL
	) OR EXISTS (
		SELECT 1
		FROM "user_command_receipts"
		WHERE "business_id" IS NULL
	) THEN
		RAISE EXCEPTION 'PRESSLY_BUSINESS_ANCESTRY_BACKFILL_INCOMPLETE';
	END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "production_locations" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_fulfillments" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_command_receipts" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "production_locations_id_business_unique" ON "production_locations" USING btree ("id","business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_id_business_unique" ON "users" USING btree ("id","business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_id_business_unique" ON "orders" USING btree ("id","business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_memberships_id_business_identity_unique" ON "workforce_memberships" USING btree ("id","business_id","identity_id");--> statement-breakpoint
ALTER TABLE "auth_access_grants" ADD CONSTRAINT "auth_access_grants_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_grants" ADD CONSTRAINT "auth_access_grants_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_grants" ADD CONSTRAINT "auth_access_grants_revoked_by_identity_id_auth_identities_id_fk" FOREIGN KEY ("revoked_by_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_grants" ADD CONSTRAINT "auth_access_grants_created_by_identity_id_auth_identities_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_grants" ADD CONSTRAINT "auth_access_grants_membership_business_identity_fk" FOREIGN KEY ("membership_id","business_id","identity_id") REFERENCES "public"."workforce_memberships"("id","business_id","identity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_access_grants" ADD CONSTRAINT "auth_access_grants_location_business_fk" FOREIGN KEY ("location_id","business_id") REFERENCES "public"."production_locations"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_command_receipts" ADD CONSTRAINT "auth_command_receipts_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_command_receipts" ADD CONSTRAINT "auth_command_receipts_actor_identity_id_auth_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_lifecycle_transitions" ADD CONSTRAINT "auth_lifecycle_transitions_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_lifecycle_transitions" ADD CONSTRAINT "auth_lifecycle_transitions_actor_identity_id_auth_identities_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_invitations" ADD CONSTRAINT "workforce_invitations_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_invitations" ADD CONSTRAINT "workforce_invitations_accepted_by_identity_id_auth_identities_id_fk" FOREIGN KEY ("accepted_by_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_invitations" ADD CONSTRAINT "workforce_invitations_revoked_by_identity_id_auth_identities_id_fk" FOREIGN KEY ("revoked_by_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_invitations" ADD CONSTRAINT "workforce_invitations_created_by_identity_id_auth_identities_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_invitations" ADD CONSTRAINT "workforce_invitations_location_business_fk" FOREIGN KEY ("intended_location_id","business_id") REFERENCES "public"."production_locations"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
CREATE UNIQUE INDEX "workforce_invitations_token_hash_unique" ON "workforce_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_invitations_one_pending_email_unique" ON "workforce_invitations" USING btree ("business_id","email_normalized") WHERE "workforce_invitations"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "workforce_invitations_business_state_idx" ON "workforce_invitations" USING btree ("business_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_memberships_one_current_per_identity_unique" ON "workforce_memberships" USING btree ("business_id","identity_id") WHERE "workforce_memberships"."state" in ('active', 'suspended');--> statement-breakpoint
CREATE INDEX "workforce_memberships_business_state_idx" ON "workforce_memberships" USING btree ("business_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "business_accounts_slug_unique" ON "business_accounts" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "auth_audit_events" ADD CONSTRAINT "auth_audit_events_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_locations" ADD CONSTRAINT "production_locations_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_order_business_fk" FOREIGN KEY ("order_id","business_id") REFERENCES "public"."orders"("id","business_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_location_business_fk" FOREIGN KEY ("location_id","business_id") REFERENCES "public"."production_locations"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_business_fk" FOREIGN KEY ("order_id","business_id") REFERENCES "public"."orders"("id","business_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_business_fk" FOREIGN KEY ("customer_user_id","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_command_receipts" ADD CONSTRAINT "user_command_receipts_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_command_receipts" ADD CONSTRAINT "user_command_receipts_user_business_fk" FOREIGN KEY ("user_id","business_id") REFERENCES "public"."users"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_business_id_business_accounts_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_fulfillments_id_business_unique" ON "order_fulfillments" USING btree ("id","business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_id_business_unique" ON "order_items" USING btree ("id","business_id");--> statement-breakpoint
CREATE INDEX "orders_business_due_state_idx" ON "orders" USING btree ("business_id","due_at","state");--> statement-breakpoint
CREATE INDEX "users_business_active_idx" ON "users" USING btree ("business_id","active");--> statement-breakpoint
ALTER TABLE "user_command_receipts" ADD CONSTRAINT "user_command_receipts_command_hash_shape" CHECK ("user_command_receipts"."command_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
-- Preserve active human floor authority before runtime readers cut over to
-- versioned grants. Legacy admin is intentionally not reclassified as manager;
-- auth_role_assignments remains its temporary compatibility read path.
INSERT INTO "workforce_memberships" (
	"business_id",
	"identity_id",
	"state",
	"version",
	"started_at",
	"created_at",
	"updated_at"
)
SELECT DISTINCT
	'00000000-0000-4000-8000-000000000100'::uuid,
	assignment."identity_id",
	'active'::workforce_membership_state,
	1,
	COALESCE(assignment."starts_at", assignment."created_at"),
	assignment."created_at",
	now()
FROM "auth_role_assignments" AS assignment
INNER JOIN "auth_identities" AS identity
	ON identity."id" = assignment."identity_id"
WHERE identity."kind" = 'human'
	AND identity."is_active" = true
	AND assignment."role" IN ('owner', 'operator')
	AND (assignment."starts_at" IS NULL OR assignment."starts_at" <= now())
	AND (assignment."ends_at" IS NULL OR assignment."ends_at" > now());--> statement-breakpoint
INSERT INTO "auth_access_grants" (
	"business_id",
	"membership_id",
	"identity_id",
	"role",
	"scope_kind",
	"scope_id",
	"scope_resource_type",
	"state",
	"version",
	"starts_at",
	"created_by_identity_id",
	"created_at",
	"updated_at"
)
SELECT DISTINCT
	membership."business_id",
	membership."id",
	membership."identity_id",
	'owner',
	'business',
	membership."business_id"::text,
	'*',
	'active'::auth_access_grant_state,
	1,
	membership."started_at",
	membership."identity_id",
	membership."created_at",
	now()
FROM "workforce_memberships" AS membership
WHERE EXISTS (
	SELECT 1
	FROM "auth_role_assignments" AS assignment
	WHERE assignment."identity_id" = membership."identity_id"
		AND assignment."role" = 'owner'
		AND (assignment."starts_at" IS NULL OR assignment."starts_at" <= now())
		AND (assignment."ends_at" IS NULL OR assignment."ends_at" > now())
);--> statement-breakpoint
WITH operator_locations AS (
	SELECT DISTINCT
		membership."id" AS "membership_id",
		membership."business_id",
		membership."identity_id",
		location."id" AS "location_id",
		COALESCE(assignment."starts_at", membership."started_at") AS "starts_at",
		membership."created_at"
	FROM "workforce_memberships" AS membership
	INNER JOIN "auth_role_assignments" AS assignment
		ON assignment."identity_id" = membership."identity_id"
	INNER JOIN "production_locations" AS location
		ON location."business_id" = membership."business_id"
		AND (
			assignment."scope_kind" = 'global'
			OR (
				assignment."scope_kind" = 'location'
				AND assignment."scope_id" = location."id"
			)
		)
	WHERE assignment."role" = 'operator'
		AND (assignment."starts_at" IS NULL OR assignment."starts_at" <= now())
		AND (assignment."ends_at" IS NULL OR assignment."ends_at" > now())
)
INSERT INTO "auth_access_grants" (
	"business_id",
	"membership_id",
	"identity_id",
	"role",
	"scope_kind",
	"scope_id",
	"scope_resource_type",
	"location_id",
	"state",
	"version",
	"starts_at",
	"created_by_identity_id",
	"created_at",
	"updated_at"
)
SELECT
	"business_id",
	"membership_id",
	"identity_id",
	'operator',
	'location',
	"location_id",
	'*',
	"location_id",
	'active'::auth_access_grant_state,
	1,
	"starts_at",
	"identity_id",
	"created_at",
	now()
FROM operator_locations;--> statement-breakpoint
COMMENT ON TABLE "auth_role_assignments" IS
	'Compatibility-only authority for sessions created before Pressly Control. No Control mutation may write this table; remove its read path after auth_access_grants cutover evidence is accepted.';--> statement-breakpoint
COMMENT ON TABLE "auth_access_grants" IS
	'Canonical versioned workforce access authority. Runtime authorization must load only active grants joined to an active workforce membership.';--> statement-breakpoint
CREATE FUNCTION "enforce_workforce_invitation_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'workforce invitations cannot be deleted';
	END IF;

	IF (
		NEW."id",
		NEW."business_id",
		NEW."email_normalized",
		NEW."display_name",
		NEW."intended_role",
		NEW."intended_location_id",
		NEW."token_hash",
		NEW."expires_at",
		NEW."created_by_identity_id",
		NEW."created_at"
	) IS DISTINCT FROM (
		OLD."id",
		OLD."business_id",
		OLD."email_normalized",
		OLD."display_name",
		OLD."intended_role",
		OLD."intended_location_id",
		OLD."token_hash",
		OLD."expires_at",
		OLD."created_by_identity_id",
		OLD."created_at"
	) THEN
		RAISE EXCEPTION 'workforce invitation authority is immutable';
	END IF;

	IF NEW."version" <> OLD."version" + 1 THEN
		RAISE EXCEPTION 'workforce invitation version must advance exactly once';
	END IF;

	RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "workforce_invitations_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "workforce_invitations"
FOR EACH ROW
EXECUTE FUNCTION "enforce_workforce_invitation_mutation"();--> statement-breakpoint
CREATE FUNCTION "enforce_workforce_membership_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'workforce memberships cannot be deleted';
	END IF;

	IF (
		NEW."id",
		NEW."business_id",
		NEW."identity_id",
		NEW."started_at",
		NEW."created_at"
	) IS DISTINCT FROM (
		OLD."id",
		OLD."business_id",
		OLD."identity_id",
		OLD."started_at",
		OLD."created_at"
	) THEN
		RAISE EXCEPTION 'workforce membership authority is immutable';
	END IF;

	IF NEW."version" <> OLD."version" + 1 THEN
		RAISE EXCEPTION 'workforce membership version must advance exactly once';
	END IF;

	RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "workforce_memberships_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "workforce_memberships"
FOR EACH ROW
EXECUTE FUNCTION "enforce_workforce_membership_mutation"();--> statement-breakpoint
CREATE FUNCTION "enforce_auth_access_grant_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'access grants cannot be deleted';
	END IF;

	IF (
		NEW."id",
		NEW."business_id",
		NEW."membership_id",
		NEW."identity_id",
		NEW."role",
		NEW."scope_kind",
		NEW."scope_id",
		NEW."scope_resource_type",
		NEW."location_id",
		NEW."starts_at",
		NEW."ends_at",
		NEW."created_by_identity_id",
		NEW."created_at"
	) IS DISTINCT FROM (
		OLD."id",
		OLD."business_id",
		OLD."membership_id",
		OLD."identity_id",
		OLD."role",
		OLD."scope_kind",
		OLD."scope_id",
		OLD."scope_resource_type",
		OLD."location_id",
		OLD."starts_at",
		OLD."ends_at",
		OLD."created_by_identity_id",
		OLD."created_at"
	) THEN
		RAISE EXCEPTION 'access grant authority is immutable';
	END IF;

	IF NEW."version" <> OLD."version" + 1 THEN
		RAISE EXCEPTION 'access grant version must advance exactly once';
	END IF;

	RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "auth_access_grants_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "auth_access_grants"
FOR EACH ROW
EXECUTE FUNCTION "enforce_auth_access_grant_mutation"();--> statement-breakpoint
CREATE FUNCTION "reject_auth_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'auth lifecycle history is append-only';
END
$$;--> statement-breakpoint
CREATE TRIGGER "auth_lifecycle_transitions_immutable"
BEFORE UPDATE OR DELETE ON "auth_lifecycle_transitions"
FOR EACH ROW
EXECUTE FUNCTION "reject_auth_history_mutation"();--> statement-breakpoint
CREATE TRIGGER "auth_command_receipts_immutable"
BEFORE UPDATE OR DELETE ON "auth_command_receipts"
FOR EACH ROW
EXECUTE FUNCTION "reject_auth_history_mutation"();--> statement-breakpoint
CREATE FUNCTION "enforce_business_retains_active_owner"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	target_business_id uuid;
	owner_authority_affected boolean;
BEGIN
	IF TG_TABLE_NAME = 'auth_access_grants' THEN
		IF TG_OP = 'DELETE' THEN
			target_business_id := OLD."business_id";
			owner_authority_affected := OLD."role" = 'owner';
		ELSIF TG_OP = 'INSERT' THEN
			target_business_id := NEW."business_id";
			owner_authority_affected := NEW."role" = 'owner';
		ELSE
			target_business_id := NEW."business_id";
			owner_authority_affected :=
				OLD."role" = 'owner' OR NEW."role" = 'owner';
		END IF;
	ELSE
		IF TG_OP = 'DELETE' THEN
			target_business_id := OLD."business_id";
			owner_authority_affected := EXISTS (
				SELECT 1
				FROM "auth_access_grants"
				WHERE "membership_id" = OLD."id"
					AND "role" = 'owner'
			);
		ELSIF TG_OP = 'INSERT' THEN
			target_business_id := NEW."business_id";
			owner_authority_affected := EXISTS (
				SELECT 1
				FROM "auth_access_grants"
				WHERE "membership_id" = NEW."id"
					AND "role" = 'owner'
			);
		ELSE
			target_business_id := NEW."business_id";
			owner_authority_affected := EXISTS (
				SELECT 1
				FROM "auth_access_grants"
				WHERE "membership_id" = NEW."id"
					AND "role" = 'owner'
			);
		END IF;
	END IF;

	IF owner_authority_affected AND NOT EXISTS (
		SELECT 1
		FROM "auth_access_grants" AS grant_record
		INNER JOIN "workforce_memberships" AS membership
			ON membership."id" = grant_record."membership_id"
			AND membership."business_id" = grant_record."business_id"
			AND membership."identity_id" = grant_record."identity_id"
		INNER JOIN "auth_identities" AS identity
			ON identity."id" = grant_record."identity_id"
		WHERE grant_record."business_id" = target_business_id
			AND grant_record."role" = 'owner'
			AND grant_record."scope_kind" = 'business'
			AND grant_record."state" = 'active'
			AND (
				grant_record."starts_at" IS NULL
				OR grant_record."starts_at" <= now()
			)
			AND grant_record."ends_at" IS NULL
			AND membership."state" = 'active'
			AND identity."is_active" = true
	) THEN
		RAISE EXCEPTION 'PRESSLY_LAST_OWNER_REQUIRED';
	END IF;

	RETURN NULL;
END
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "auth_access_grants_last_owner_guard"
AFTER INSERT OR UPDATE OR DELETE ON "auth_access_grants"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_business_retains_active_owner"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "workforce_memberships_last_owner_guard"
AFTER INSERT OR UPDATE OR DELETE ON "workforce_memberships"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_business_retains_active_owner"();--> statement-breakpoint
CREATE FUNCTION "enforce_identity_deactivation_retains_active_owner"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	target_identity_id uuid;
	target_business_id uuid;
BEGIN
	IF TG_OP = 'DELETE' THEN
		target_identity_id := OLD."id";
	ELSIF OLD."is_active" = true AND NEW."is_active" = false THEN
		target_identity_id := NEW."id";
	ELSE
		RETURN NULL;
	END IF;

	FOR target_business_id IN
		SELECT DISTINCT grant_record."business_id"
		FROM "auth_access_grants" AS grant_record
		WHERE grant_record."identity_id" = target_identity_id
			AND grant_record."role" = 'owner'
	LOOP
		IF NOT EXISTS (
			SELECT 1
			FROM "auth_access_grants" AS grant_record
			INNER JOIN "workforce_memberships" AS membership
				ON membership."id" = grant_record."membership_id"
				AND membership."business_id" = grant_record."business_id"
				AND membership."identity_id" = grant_record."identity_id"
			INNER JOIN "auth_identities" AS identity
				ON identity."id" = grant_record."identity_id"
			WHERE grant_record."business_id" = target_business_id
				AND grant_record."role" = 'owner'
				AND grant_record."scope_kind" = 'business'
				AND grant_record."state" = 'active'
				AND (
					grant_record."starts_at" IS NULL
					OR grant_record."starts_at" <= now()
				)
				AND grant_record."ends_at" IS NULL
				AND membership."state" = 'active'
				AND identity."is_active" = true
		) THEN
			RAISE EXCEPTION 'PRESSLY_LAST_OWNER_REQUIRED';
		END IF;
	END LOOP;

	RETURN NULL;
END
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "auth_identities_last_owner_guard"
AFTER UPDATE OR DELETE ON "auth_identities"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_identity_deactivation_retains_active_owner"();
