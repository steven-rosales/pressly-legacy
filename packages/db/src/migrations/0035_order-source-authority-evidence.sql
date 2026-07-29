CREATE TABLE "order_source_capability_profiles" (
	"source" text NOT NULL,
	"profile_version" text NOT NULL,
	"policy_version" text NOT NULL,
	"capability_definition_json" jsonb NOT NULL,
	"definition_hash" text NOT NULL,
	"created_by_actor_kind" text NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"reason_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_source_capability_profiles_pk" PRIMARY KEY("source","profile_version"),
	CONSTRAINT "order_source_capability_profiles_identity_present" CHECK (length(btrim("order_source_capability_profiles"."source")) > 0 and length(btrim("order_source_capability_profiles"."profile_version")) > 0 and length(btrim("order_source_capability_profiles"."policy_version")) > 0),
	CONSTRAINT "order_source_capability_profiles_definition_object" CHECK (jsonb_typeof("order_source_capability_profiles"."capability_definition_json") = 'object'),
	CONSTRAINT "order_source_capability_profiles_hash_shape" CHECK ("order_source_capability_profiles"."definition_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "order_source_capability_profiles_actor_kind_valid" CHECK ("order_source_capability_profiles"."created_by_actor_kind" in ('human', 'service', 'system')),
	CONSTRAINT "order_source_capability_profiles_context_present" CHECK (length(btrim("order_source_capability_profiles"."created_by_actor_id")) > 0 and length(btrim("order_source_capability_profiles"."reason_code")) > 0 and ("order_source_capability_profiles"."reason_note" is null or length(btrim("order_source_capability_profiles"."reason_note")) > 0))
);
--> statement-breakpoint
CREATE TABLE "order_source_control_revisions" (
	"source" text NOT NULL,
	"location_id" text NOT NULL,
	"version" integer NOT NULL,
	"profile_version" text NOT NULL,
	"from_posture" text,
	"posture" text NOT NULL,
	"event_type" text NOT NULL,
	"changed_by_actor_kind" text NOT NULL,
	"changed_by_actor_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"reason_note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_source_control_revisions_pk" PRIMARY KEY("source","location_id","version"),
	CONSTRAINT "order_source_control_revisions_identity_present" CHECK (length(btrim("order_source_control_revisions"."source")) > 0 and length(btrim("order_source_control_revisions"."location_id")) > 0 and length(btrim("order_source_control_revisions"."profile_version")) > 0),
	CONSTRAINT "order_source_control_revisions_positive_version" CHECK ("order_source_control_revisions"."version" > 0),
	CONSTRAINT "order_source_control_revisions_posture_valid" CHECK ("order_source_control_revisions"."posture" in ('normal', 'observe_only', 'blocked') and ("order_source_control_revisions"."from_posture" is null or "order_source_control_revisions"."from_posture" in ('normal', 'observe_only', 'blocked'))),
	CONSTRAINT "order_source_control_revisions_event_valid" CHECK ("order_source_control_revisions"."event_type" in ('initialize', 'degrade_to_observe_only', 'block', 'restore_to_observe_only', 'restore_to_normal')),
	CONSTRAINT "order_source_control_revisions_initialization_consistent" CHECK (("order_source_control_revisions"."version" = 1 and "order_source_control_revisions"."event_type" = 'initialize' and "order_source_control_revisions"."from_posture" is null) or ("order_source_control_revisions"."version" > 1 and "order_source_control_revisions"."event_type" <> 'initialize' and "order_source_control_revisions"."from_posture" is not null)),
	CONSTRAINT "order_source_control_revisions_transition_consistent" CHECK (("order_source_control_revisions"."event_type" = 'initialize') or ("order_source_control_revisions"."event_type" = 'degrade_to_observe_only' and "order_source_control_revisions"."from_posture" = 'normal' and "order_source_control_revisions"."posture" = 'observe_only') or ("order_source_control_revisions"."event_type" = 'block' and "order_source_control_revisions"."from_posture" in ('normal', 'observe_only') and "order_source_control_revisions"."posture" = 'blocked') or ("order_source_control_revisions"."event_type" = 'restore_to_observe_only' and "order_source_control_revisions"."from_posture" = 'blocked' and "order_source_control_revisions"."posture" = 'observe_only') or ("order_source_control_revisions"."event_type" = 'restore_to_normal' and "order_source_control_revisions"."from_posture" = 'observe_only' and "order_source_control_revisions"."posture" = 'normal')),
	CONSTRAINT "order_source_control_revisions_actor_kind_valid" CHECK ("order_source_control_revisions"."changed_by_actor_kind" in ('human', 'service', 'system')),
	CONSTRAINT "order_source_control_revisions_context_present" CHECK (length(btrim("order_source_control_revisions"."changed_by_actor_id")) > 0 and length(btrim("order_source_control_revisions"."reason_code")) > 0 and ("order_source_control_revisions"."reason_note" is null or length(btrim("order_source_control_revisions"."reason_note")) > 0))
);
--> statement-breakpoint
CREATE TABLE "order_source_observation_decisions" (
	"evaluation_key" text PRIMARY KEY NOT NULL,
	"source_link_id" uuid,
	"source" text NOT NULL,
	"external_order_id" text NOT NULL,
	"location_id" text NOT NULL,
	"source_revision_at" timestamp with time zone NOT NULL,
	"source_revision_hash" text NOT NULL,
	"adapter_version" text NOT NULL,
	"source_lifecycle_code" text,
	"configuration_status" text NOT NULL,
	"profile_version" text,
	"control_version" integer,
	"policy_version" text NOT NULL,
	"evaluation_mode" text NOT NULL,
	"revision_classification" text NOT NULL,
	"claim_phase" text NOT NULL,
	"overall_disposition" text,
	"assurance_demotion" integer NOT NULL,
	"claim_decisions_json" jsonb NOT NULL,
	"reason_codes_json" jsonb NOT NULL,
	"proposed_fields_json" jsonb NOT NULL,
	"adopted_fields_json" jsonb NOT NULL,
	"canonical_effect" text NOT NULL,
	"order_version_before" integer,
	"order_version_after" integer,
	"fulfillment_version_before" integer,
	"fulfillment_version_after" integer,
	"observed_at" timestamp with time zone NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_source_observation_decisions_evaluation_key_shape" CHECK ("order_source_observation_decisions"."evaluation_key" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "order_source_observation_decisions_identity_present" CHECK (length(btrim("order_source_observation_decisions"."source")) > 0 and length(btrim("order_source_observation_decisions"."external_order_id")) > 0 and length(btrim("order_source_observation_decisions"."location_id")) > 0 and length(btrim("order_source_observation_decisions"."adapter_version")) > 0 and length(btrim("order_source_observation_decisions"."policy_version")) > 0),
	CONSTRAINT "order_source_observation_decisions_revision_hash_shape" CHECK ("order_source_observation_decisions"."source_revision_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "order_source_observation_decisions_configuration_consistent" CHECK (("order_source_observation_decisions"."configuration_status" = 'configured' and "order_source_observation_decisions"."profile_version" is not null and length(btrim("order_source_observation_decisions"."profile_version")) > 0 and "order_source_observation_decisions"."control_version" is not null and "order_source_observation_decisions"."control_version" > 0) or ("order_source_observation_decisions"."configuration_status" = 'unconfigured' and "order_source_observation_decisions"."profile_version" is null and "order_source_observation_decisions"."control_version" is null)),
	CONSTRAINT "order_source_observation_decisions_mode_valid" CHECK ("order_source_observation_decisions"."evaluation_mode" in ('shadow', 'enforced')),
	CONSTRAINT "order_source_observation_decisions_revision_valid" CHECK ("order_source_observation_decisions"."revision_classification" in ('newer', 'replay', 'stale', 'conflict')),
	CONSTRAINT "order_source_observation_decisions_phase_valid" CHECK ("order_source_observation_decisions"."claim_phase" in ('creation', 'unreleased', 'released', 'terminal')),
	CONSTRAINT "order_source_observation_decisions_disposition_valid" CHECK (("order_source_observation_decisions"."revision_classification" = 'newer' and "order_source_observation_decisions"."overall_disposition" in ('deny', 'observe', 'propose', 'auto_adopt')) or ("order_source_observation_decisions"."revision_classification" <> 'newer' and "order_source_observation_decisions"."overall_disposition" is null)),
	CONSTRAINT "order_source_observation_decisions_unconfigured_denied" CHECK ("order_source_observation_decisions"."configuration_status" = 'configured' or ("order_source_observation_decisions"."revision_classification" = 'newer' and "order_source_observation_decisions"."overall_disposition" = 'deny') or ("order_source_observation_decisions"."revision_classification" <> 'newer' and "order_source_observation_decisions"."overall_disposition" is null)),
	CONSTRAINT "order_source_observation_decisions_assurance_valid" CHECK ("order_source_observation_decisions"."assurance_demotion" between 0 and 3),
	CONSTRAINT "order_source_observation_decisions_evidence_arrays" CHECK (jsonb_typeof("order_source_observation_decisions"."claim_decisions_json") = 'array' and jsonb_typeof("order_source_observation_decisions"."reason_codes_json") = 'array' and jsonb_array_length("order_source_observation_decisions"."reason_codes_json") > 0 and jsonb_typeof("order_source_observation_decisions"."proposed_fields_json") = 'array' and jsonb_typeof("order_source_observation_decisions"."adopted_fields_json") = 'array'),
	CONSTRAINT "order_source_observation_decisions_effect_valid" CHECK ("order_source_observation_decisions"."canonical_effect" in ('none', 'canonical_created', 'canonical_updated')),
	CONSTRAINT "order_source_observation_decisions_version_presence" CHECK (("order_source_observation_decisions"."order_version_before" is null) = ("order_source_observation_decisions"."fulfillment_version_before" is null) and ("order_source_observation_decisions"."order_version_after" is null) = ("order_source_observation_decisions"."fulfillment_version_after" is null)),
	CONSTRAINT "order_source_observation_decisions_versions_positive" CHECK (("order_source_observation_decisions"."order_version_before" is null or "order_source_observation_decisions"."order_version_before" > 0) and ("order_source_observation_decisions"."order_version_after" is null or "order_source_observation_decisions"."order_version_after" > 0) and ("order_source_observation_decisions"."fulfillment_version_before" is null or "order_source_observation_decisions"."fulfillment_version_before" > 0) and ("order_source_observation_decisions"."fulfillment_version_after" is null or "order_source_observation_decisions"."fulfillment_version_after" > 0)),
	CONSTRAINT "order_source_observation_decisions_versions_monotonic" CHECK (("order_source_observation_decisions"."order_version_before" is null or "order_source_observation_decisions"."order_version_after" >= "order_source_observation_decisions"."order_version_before") and ("order_source_observation_decisions"."fulfillment_version_before" is null or "order_source_observation_decisions"."fulfillment_version_after" >= "order_source_observation_decisions"."fulfillment_version_before")),
	CONSTRAINT "order_source_observation_decisions_effect_consistent" CHECK ((
        "order_source_observation_decisions"."canonical_effect" = 'none'
        and (
          (
            "order_source_observation_decisions"."order_version_before" is null
            and "order_source_observation_decisions"."order_version_after" is null
            and "order_source_observation_decisions"."fulfillment_version_before" is null
            and "order_source_observation_decisions"."fulfillment_version_after" is null
          )
          or (
            "order_source_observation_decisions"."order_version_before" is not null
            and "order_source_observation_decisions"."order_version_after" is not null
            and "order_source_observation_decisions"."fulfillment_version_before" is not null
            and "order_source_observation_decisions"."fulfillment_version_after" is not null
            and
            "order_source_observation_decisions"."order_version_before" = "order_source_observation_decisions"."order_version_after"
            and "order_source_observation_decisions"."fulfillment_version_before" = "order_source_observation_decisions"."fulfillment_version_after"
          )
        )
      ) or (
        "order_source_observation_decisions"."canonical_effect" = 'canonical_created'
        and "order_source_observation_decisions"."order_version_before" is null
        and "order_source_observation_decisions"."order_version_after" is not null
        and "order_source_observation_decisions"."fulfillment_version_before" is null
        and "order_source_observation_decisions"."fulfillment_version_after" is not null
      ) or (
        "order_source_observation_decisions"."canonical_effect" = 'canonical_updated'
        and "order_source_observation_decisions"."order_version_before" is not null
        and "order_source_observation_decisions"."order_version_after" is not null
        and "order_source_observation_decisions"."fulfillment_version_before" is not null
        and "order_source_observation_decisions"."fulfillment_version_after" is not null
        and (
          "order_source_observation_decisions"."order_version_after" > "order_source_observation_decisions"."order_version_before"
          or "order_source_observation_decisions"."fulfillment_version_after" > "order_source_observation_decisions"."fulfillment_version_before"
        )
      )),
	CONSTRAINT "order_source_observation_decisions_shadow_has_no_effect" CHECK ("order_source_observation_decisions"."evaluation_mode" <> 'shadow' or "order_source_observation_decisions"."canonical_effect" = 'none'),
	CONSTRAINT "order_source_observation_decisions_nonnewer_has_no_effect" CHECK ("order_source_observation_decisions"."revision_classification" = 'newer' or "order_source_observation_decisions"."canonical_effect" = 'none')
);
--> statement-breakpoint
ALTER TABLE "order_command_receipts" ADD COLUMN "reason_code" text;--> statement-breakpoint
ALTER TABLE "order_command_receipts" ADD COLUMN "reason_note" text;--> statement-breakpoint
ALTER TABLE "order_source_control_revisions" ADD CONSTRAINT "order_source_control_revisions_profile_fk" FOREIGN KEY ("source","profile_version") REFERENCES "public"."order_source_capability_profiles"("source","profile_version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_source_links_id_identity_unique" ON "order_source_links" USING btree ("id","source","external_order_id");--> statement-breakpoint
ALTER TABLE "order_source_observation_decisions" ADD CONSTRAINT "order_source_observation_decisions_source_link_fk" FOREIGN KEY ("source_link_id","source","external_order_id") REFERENCES "public"."order_source_links"("id","source","external_order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_observation_decisions" ADD CONSTRAINT "order_source_observation_decisions_profile_fk" FOREIGN KEY ("source","profile_version") REFERENCES "public"."order_source_capability_profiles"("source","profile_version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_source_observation_decisions" ADD CONSTRAINT "order_source_observation_decisions_control_fk" FOREIGN KEY ("source","location_id","control_version") REFERENCES "public"."order_source_control_revisions"("source","location_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_source_control_revisions_location_source_version_idx" ON "order_source_control_revisions" USING btree ("location_id","source","version");--> statement-breakpoint
CREATE INDEX "order_source_observation_decisions_source_revision_idx" ON "order_source_observation_decisions" USING btree ("source","external_order_id","source_revision_at");--> statement-breakpoint
CREATE INDEX "order_source_observation_decisions_location_evaluated_idx" ON "order_source_observation_decisions" USING btree ("location_id","evaluated_at");--> statement-breakpoint
ALTER TABLE "order_command_receipts" ADD CONSTRAINT "order_command_receipts_reason_consistent" CHECK (("order_command_receipts"."reason_code" is null and "order_command_receipts"."reason_note" is null) or ("order_command_receipts"."reason_code" is not null and length(btrim("order_command_receipts"."reason_code")) > 0 and ("order_command_receipts"."reason_note" is null or length(btrim("order_command_receipts"."reason_note")) > 0)));
--> statement-breakpoint
CREATE FUNCTION "reject_order_source_authority_evidence_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'ORDER_SOURCE_AUTHORITY_EVIDENCE_APPEND_ONLY table=% operation=%', TG_TABLE_NAME, TG_OP
		USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "order_source_capability_profiles_append_only"
BEFORE UPDATE OR DELETE ON "order_source_capability_profiles"
FOR EACH ROW
EXECUTE FUNCTION "reject_order_source_authority_evidence_mutation"();
--> statement-breakpoint
CREATE TRIGGER "order_source_control_revisions_append_only"
BEFORE UPDATE OR DELETE ON "order_source_control_revisions"
FOR EACH ROW
EXECUTE FUNCTION "reject_order_source_authority_evidence_mutation"();
--> statement-breakpoint
CREATE TRIGGER "order_source_observation_decisions_append_only"
BEFORE UPDATE OR DELETE ON "order_source_observation_decisions"
FOR EACH ROW
EXECUTE FUNCTION "reject_order_source_authority_evidence_mutation"();
