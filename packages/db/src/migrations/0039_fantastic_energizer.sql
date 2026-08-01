DROP TABLE "order_source_observation_decisions";--> statement-breakpoint
DROP TABLE "order_source_control_revisions";--> statement-breakpoint
DROP TABLE "order_source_capability_profiles";--> statement-breakpoint
DROP TABLE "order_field_authorities";--> statement-breakpoint
DROP FUNCTION "reject_order_source_authority_evidence_mutation"();--> statement-breakpoint
ALTER TABLE "order_demands" DROP COLUMN "source_status_code";
