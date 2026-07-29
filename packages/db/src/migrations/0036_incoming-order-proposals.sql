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
	CONSTRAINT "order_source_proposal_resolutions_version_valid" CHECK ("order_source_proposal_resolutions"."proposal_version" = 2),
	CONSTRAINT "order_source_proposal_resolutions_effect_consistent" CHECK (("order_source_proposal_resolutions"."decision" = 'accepted' and "order_source_proposal_resolutions"."order_id" is not null and "order_source_proposal_resolutions"."fulfillment_id" is not null) or ("order_source_proposal_resolutions"."decision" = 'rejected' and "order_source_proposal_resolutions"."order_id" is null and "order_source_proposal_resolutions"."fulfillment_id" is null)),
	CONSTRAINT "order_source_proposal_resolutions_command_hash_shape" CHECK ("order_source_proposal_resolutions"."command_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "order_source_proposal_resolutions_actor_kind_valid" CHECK ("order_source_proposal_resolutions"."actor_kind" in ('human', 'service', 'system')),
	CONSTRAINT "order_source_proposal_resolutions_context_present" CHECK (length(btrim("order_source_proposal_resolutions"."idempotency_key")) > 0 and length(btrim("order_source_proposal_resolutions"."origin")) > 0 and length(btrim("order_source_proposal_resolutions"."actor_id")) > 0 and length(btrim("order_source_proposal_resolutions"."reason_code")) > 0 and ("order_source_proposal_resolutions"."reason_note" is null or length(btrim("order_source_proposal_resolutions"."reason_note")) > 0))
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
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_source_proposals_identity_present" CHECK (length(btrim("order_source_proposals"."source")) > 0 and length(btrim("order_source_proposals"."external_order_id")) > 0 and length(btrim("order_source_proposals"."location_id")) > 0 and length(btrim("order_source_proposals"."adapter_version")) > 0),
	CONSTRAINT "order_source_proposals_pickup_only" CHECK ("order_source_proposals"."proposal_kind" = 'pickup'),
	CONSTRAINT "order_source_proposals_hash_shape" CHECK ("order_source_proposals"."source_revision_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "order_source_proposals_snapshot_object" CHECK (jsonb_typeof("order_source_proposals"."proposal_snapshot_json") = 'object'),
	CONSTRAINT "order_source_proposals_weight_positive" CHECK ("order_source_proposals"."estimated_weight_lbs" is null or "order_source_proposals"."estimated_weight_lbs" > 0),
	CONSTRAINT "order_source_proposals_immutable_version" CHECK ("order_source_proposals"."version" = 1)
);
--> statement-breakpoint
ALTER TABLE "order_source_proposal_resolutions" ADD CONSTRAINT "order_source_proposal_resolutions_proposal_id_order_source_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."order_source_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_proposal_resolutions" ADD CONSTRAINT "order_source_proposal_resolutions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_proposal_resolutions" ADD CONSTRAINT "order_source_proposal_resolutions_fulfillment_id_order_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."order_fulfillments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_proposal_resolutions_idempotency_unique" ON "order_source_proposal_resolutions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "order_source_proposal_resolutions_order_idx" ON "order_source_proposal_resolutions" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_proposals_source_identity_unique" ON "order_source_proposals" USING btree ("source","external_order_id");--> statement-breakpoint
CREATE INDEX "order_source_proposals_location_observed_idx" ON "order_source_proposals" USING btree ("location_id","observed_at","id");--> statement-breakpoint
CREATE FUNCTION "reject_order_source_proposal_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'incoming Order proposal evidence is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "order_source_proposals_immutable"
BEFORE UPDATE OR DELETE ON "order_source_proposals"
FOR EACH ROW
EXECUTE FUNCTION "reject_order_source_proposal_mutation"();--> statement-breakpoint
CREATE TRIGGER "order_source_proposal_resolutions_immutable"
BEFORE UPDATE OR DELETE ON "order_source_proposal_resolutions"
FOR EACH ROW
EXECUTE FUNCTION "reject_order_source_proposal_mutation"();
