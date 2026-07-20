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
ALTER TABLE "webhook_receipt_quarantine" ADD CONSTRAINT "webhook_receipt_quarantine_webhook_event_id_webhook_events_id_fk" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."webhook_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_receipt_quarantine_body_version_unique" ON "webhook_receipt_quarantine" USING btree ("source","raw_body_sha256","adapter_version");--> statement-breakpoint
CREATE INDEX "webhook_receipt_quarantine_expiry_idx" ON "webhook_receipt_quarantine" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "webhook_receipt_quarantine_event_idx" ON "webhook_receipt_quarantine" USING btree ("webhook_event_id");