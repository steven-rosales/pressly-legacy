CREATE TABLE "order_command_receipts" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"command_hash" text NOT NULL,
	"order_id" uuid NOT NULL,
	"result_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_field_authorities" (
	"order_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"authority" text NOT NULL,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_field_authorities_order_id_field_name_pk" PRIMARY KEY("order_id","field_name"),
	CONSTRAINT "order_field_authorities_valid" CHECK (("order_field_authorities"."authority" = 'pressly' and "order_field_authorities"."source" is null) or ("order_field_authorities"."authority" = 'source' and "order_field_authorities"."source" is not null))
);
--> statement-breakpoint
CREATE TABLE "order_fulfillments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type_code" text NOT NULL,
	"location_id" text NOT NULL,
	"release_state" text DEFAULT 'unreleased' NOT NULL,
	"estimated_weight_lbs" numeric(12, 3),
	"estimated_weight_source" text,
	"bag_count" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_fulfillments_release_state_valid" CHECK ("order_fulfillments"."release_state" in ('unreleased', 'released', 'withdrawn')),
	CONSTRAINT "order_fulfillments_weight_positive" CHECK ("order_fulfillments"."estimated_weight_lbs" is null or "order_fulfillments"."estimated_weight_lbs" > 0),
	CONSTRAINT "order_fulfillments_weight_provenance_consistent" CHECK (("order_fulfillments"."estimated_weight_lbs" is null) = ("order_fulfillments"."estimated_weight_source" is null)),
	CONSTRAINT "order_fulfillments_bag_count_nonnegative" CHECK ("order_fulfillments"."bag_count" is null or "order_fulfillments"."bag_count" >= 0),
	CONSTRAINT "order_fulfillments_positive_version" CHECK ("order_fulfillments"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"last_error_code" text,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_outbox_events_status_valid" CHECK ("order_outbox_events"."status" in ('pending', 'processing', 'completed')),
	CONSTRAINT "order_outbox_events_attempts_nonnegative" CHECK ("order_outbox_events"."attempts" >= 0),
	CONSTRAINT "order_outbox_events_positive_version" CHECK ("order_outbox_events"."aggregate_version" > 0),
	CONSTRAINT "order_outbox_events_lease_consistent" CHECK (("order_outbox_events"."status" = 'processing' and "order_outbox_events"."lease_owner" is not null and "order_outbox_events"."lease_expires_at" is not null and "order_outbox_events"."completed_at" is null) or ("order_outbox_events"."status" = 'pending' and "order_outbox_events"."lease_owner" is null and "order_outbox_events"."lease_expires_at" is null and "order_outbox_events"."completed_at" is null) or ("order_outbox_events"."status" = 'completed' and "order_outbox_events"."lease_owner" is null and "order_outbox_events"."lease_expires_at" is null and "order_outbox_events"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "order_source_customer_refs" (
	"order_source_link_id" uuid PRIMARY KEY NOT NULL,
	"external_user_id" text,
	"resolved_user_id" uuid,
	"resolution" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_source_customer_refs_resolution_valid" CHECK ("order_source_customer_refs"."resolution" in ('resolved', 'not_provided', 'pending', 'conflict', 'legacy_unknown')),
	CONSTRAINT "order_source_customer_refs_resolution_consistent" CHECK (("order_source_customer_refs"."resolution" = 'resolved' and "order_source_customer_refs"."external_user_id" is not null and "order_source_customer_refs"."resolved_user_id" is not null) or ("order_source_customer_refs"."resolution" = 'not_provided' and "order_source_customer_refs"."external_user_id" is null and "order_source_customer_refs"."resolved_user_id" is null) or ("order_source_customer_refs"."resolution" in ('pending', 'conflict') and "order_source_customer_refs"."external_user_id" is not null and "order_source_customer_refs"."resolved_user_id" is null) or ("order_source_customer_refs"."resolution" = 'legacy_unknown' and "order_source_customer_refs"."resolved_user_id" is null))
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
CREATE TABLE "order_source_snapshots" (
	"source_link_id" uuid PRIMARY KEY NOT NULL,
	"source_revision_at" timestamp with time zone NOT NULL,
	"source_revision_hash" text NOT NULL,
	"adapter_version" text NOT NULL,
	"normalized_payload_json" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_source_snapshots_hash_shape" CHECK ("order_source_snapshots"."source_revision_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_user_id" uuid,
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
	CONSTRAINT "orders_customer_resolution_valid" CHECK ("orders"."customer_resolution" in ('resolved', 'not_provided', 'pending', 'conflict', 'legacy_unknown')),
	CONSTRAINT "orders_customer_resolution_consistent" CHECK (("orders"."customer_resolution" = 'resolved' and "orders"."customer_user_id" is not null) or ("orders"."customer_resolution" <> 'resolved' and "orders"."customer_user_id" is null)),
	CONSTRAINT "orders_state_valid" CHECK ("orders"."state" in ('open', 'completed', 'canceled')),
	CONSTRAINT "orders_currency_shape" CHECK ("orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_amounts_nonnegative" CHECK ("orders"."total_amount_cents" >= 0 and ("orders"."balance_due_cents" is null or "orders"."balance_due_cents" >= 0)),
	CONSTRAINT "orders_positive_version" CHECK ("orders"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_command_receipts" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"command_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"result_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"version" integer DEFAULT 1 NOT NULL,
	"first_name" text,
	"last_name" text,
	"business_name" text,
	"phone" text,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_positive_version" CHECK ("users"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "order_command_receipts" ADD CONSTRAINT "order_command_receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_field_authorities" ADD CONSTRAINT "order_field_authorities_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_outbox_events" ADD CONSTRAINT "order_outbox_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_outbox_events" ADD CONSTRAINT "order_outbox_events_fulfillment_id_order_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."order_fulfillments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_customer_refs" ADD CONSTRAINT "order_source_customer_refs_order_source_link_id_order_source_links_id_fk" FOREIGN KEY ("order_source_link_id") REFERENCES "public"."order_source_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_customer_refs" ADD CONSTRAINT "order_source_customer_refs_resolved_user_id_users_id_fk" FOREIGN KEY ("resolved_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_links" ADD CONSTRAINT "order_source_links_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_snapshots" ADD CONSTRAINT "order_source_snapshots_source_link_id_order_source_links_id_fk" FOREIGN KEY ("source_link_id") REFERENCES "public"."order_source_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_command_receipts" ADD CONSTRAINT "user_command_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_duplicate_candidates" ADD CONSTRAINT "user_duplicate_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_duplicate_candidates" ADD CONSTRAINT "user_duplicate_candidates_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_field_authorities" ADD CONSTRAINT "user_field_authorities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_source_links" ADD CONSTRAINT "user_source_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_source_snapshots" ADD CONSTRAINT "user_source_snapshots_source_link_id_user_source_links_id_fk" FOREIGN KEY ("source_link_id") REFERENCES "public"."user_source_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_fulfillments_order_type_unique" ON "order_fulfillments" USING btree ("order_id","type_code");--> statement-breakpoint
CREATE INDEX "order_fulfillments_location_release_idx" ON "order_fulfillments" USING btree ("location_id","release_state");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_line_unique" ON "order_items" USING btree ("order_id","line_key");--> statement-breakpoint
CREATE UNIQUE INDEX "order_outbox_events_version_unique" ON "order_outbox_events" USING btree ("order_id","fulfillment_id","aggregate_version","event_type");--> statement-breakpoint
CREATE INDEX "order_outbox_events_claimable_idx" ON "order_outbox_events" USING btree ("status","available_at","lease_expires_at");--> statement-breakpoint
CREATE INDEX "order_source_customer_refs_external_idx" ON "order_source_customer_refs" USING btree ("external_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_links_source_identity_unique" ON "order_source_links" USING btree ("source","external_order_id");--> statement-breakpoint
CREATE INDEX "order_source_links_order_idx" ON "order_source_links" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_source_snapshots_revision_idx" ON "order_source_snapshots" USING btree ("source_revision_at");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_user_id");--> statement-breakpoint
CREATE INDEX "orders_due_state_idx" ON "orders" USING btree ("due_at","state");--> statement-breakpoint
CREATE UNIQUE INDEX "user_consents_idempotency_unique" ON "user_consents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "user_consents_user_observed_idx" ON "user_consents" USING btree ("user_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_duplicate_candidates_pair_reason_unique" ON "user_duplicate_candidates" USING btree ("user_id","candidate_user_id","reason");--> statement-breakpoint
CREATE UNIQUE INDEX "user_source_links_source_identity_unique" ON "user_source_links" USING btree ("source","external_user_id");--> statement-breakpoint
CREATE INDEX "user_source_links_user_idx" ON "user_source_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_source_snapshots_revision_idx" ON "user_source_snapshots" USING btree ("source_revision_at");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;