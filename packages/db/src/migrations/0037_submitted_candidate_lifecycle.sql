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
ALTER TABLE "order_source_proposal_resolutions" DROP CONSTRAINT "order_source_proposal_resolutions_version_valid";--> statement-breakpoint
ALTER TABLE "order_source_proposals" DROP CONSTRAINT "order_source_proposals_pickup_only";--> statement-breakpoint
ALTER TABLE "order_source_proposals" DROP CONSTRAINT "order_source_proposals_immutable_version";--> statement-breakpoint
ALTER TABLE "order_source_proposals" ADD COLUMN "state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
DROP TRIGGER "order_source_proposals_immutable" ON "order_source_proposals";--> statement-breakpoint
CREATE FUNCTION "enforce_order_source_proposal_snapshot_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'incoming Order proposal evidence is append-only';
  END IF;

  IF (
    NEW.id,
    NEW.source,
    NEW.external_order_id,
    NEW.location_id,
    NEW.proposal_kind,
    NEW.source_revision_at,
    NEW.source_revision_hash,
    NEW.adapter_version,
    NEW.proposal_snapshot_json,
    NEW.customer_display_name,
    NEW.customer_phone,
    NEW.customer_email,
    NEW.display_number,
    NEW.due_at,
    NEW.estimated_weight_lbs,
    NEW.observed_at,
    NEW.created_at
  ) IS DISTINCT FROM (
    OLD.id,
    OLD.source,
    OLD.external_order_id,
    OLD.location_id,
    OLD.proposal_kind,
    OLD.source_revision_at,
    OLD.source_revision_hash,
    OLD.adapter_version,
    OLD.proposal_snapshot_json,
    OLD.customer_display_name,
    OLD.customer_phone,
    OLD.customer_email,
    OLD.display_number,
    OLD.due_at,
    OLD.estimated_weight_lbs,
    OLD.observed_at,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'incoming Order proposal snapshot is immutable';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'incoming Order proposal version must advance exactly once';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "order_source_proposals_snapshot_immutable"
BEFORE UPDATE OR DELETE ON "order_source_proposals"
FOR EACH ROW
EXECUTE FUNCTION "enforce_order_source_proposal_snapshot_immutable"();--> statement-breakpoint
ALTER TABLE "order_source_proposal_transitions" ADD CONSTRAINT "order_source_proposal_transitions_proposal_id_order_source_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."order_source_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_terminal_tombstones" ADD CONSTRAINT "order_source_terminal_tombstones_proposal_id_order_source_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."order_source_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_proposal_transitions_version_unique" ON "order_source_proposal_transitions" USING btree ("proposal_id","proposal_version");--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_proposal_transitions_idempotency_unique" ON "order_source_proposal_transitions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "order_source_proposal_transitions_proposal_occurred_idx" ON "order_source_proposal_transitions" USING btree ("proposal_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_terminal_tombstones_identity_unique" ON "order_source_terminal_tombstones" USING btree ("source","external_order_id");--> statement-breakpoint
CREATE INDEX "order_source_terminal_tombstones_proposal_idx" ON "order_source_terminal_tombstones" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "order_source_proposals_location_state_observed_idx" ON "order_source_proposals" USING btree ("location_id","state","observed_at","id");--> statement-breakpoint
UPDATE "order_source_proposals" AS proposal
SET
  "state" = resolution."decision",
  "version" = resolution."proposal_version"
FROM "order_source_proposal_resolutions" AS resolution
WHERE resolution."proposal_id" = proposal."id";--> statement-breakpoint
INSERT INTO "order_source_proposal_transitions" (
  "proposal_id",
  "from_state",
  "to_state",
  "event_type",
  "proposal_version",
  "idempotency_key",
  "command_hash",
  "origin",
  "actor_kind",
  "actor_id",
  "reason_code",
  "reason_note",
  "source_terminal_code",
  "occurred_at"
)
SELECT
  resolution."proposal_id",
  'pending',
  resolution."decision",
  CASE
    WHEN resolution."decision" = 'accepted' THEN 'accept'
    ELSE 'reject'
  END,
  resolution."proposal_version",
  resolution."idempotency_key",
  resolution."command_hash",
  resolution."origin",
  resolution."actor_kind",
  resolution."actor_id",
  resolution."reason_code",
  resolution."reason_note",
  NULL,
  resolution."decided_at"
FROM "order_source_proposal_resolutions" AS resolution;--> statement-breakpoint
CREATE TRIGGER "order_source_proposal_transitions_immutable"
BEFORE UPDATE OR DELETE ON "order_source_proposal_transitions"
FOR EACH ROW
EXECUTE FUNCTION "reject_order_source_proposal_mutation"();--> statement-breakpoint
CREATE TRIGGER "order_source_terminal_tombstones_immutable"
BEFORE UPDATE OR DELETE ON "order_source_terminal_tombstones"
FOR EACH ROW
EXECUTE FUNCTION "reject_order_source_proposal_mutation"();--> statement-breakpoint
ALTER TABLE "order_source_proposal_resolutions" ADD CONSTRAINT "order_source_proposal_resolutions_version_valid" CHECK ("order_source_proposal_resolutions"."proposal_version" > 1);--> statement-breakpoint
ALTER TABLE "order_source_proposals" ADD CONSTRAINT "order_source_proposals_kind_valid" CHECK ("order_source_proposals"."proposal_kind" in ('pickup', 'submitted_order'));--> statement-breakpoint
ALTER TABLE "order_source_proposals" ADD CONSTRAINT "order_source_proposals_state_valid" CHECK ("order_source_proposals"."state" in ('pending', 'source_closed', 'restored_pending', 'accepted', 'rejected'));--> statement-breakpoint
ALTER TABLE "order_source_proposals" ADD CONSTRAINT "order_source_proposals_positive_version" CHECK ("order_source_proposals"."version" > 0);
