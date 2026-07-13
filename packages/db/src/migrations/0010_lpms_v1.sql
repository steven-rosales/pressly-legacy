CREATE TABLE "production_bags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_order_id" uuid NOT NULL,
	"bag_index" integer NOT NULL,
	"status" text DEFAULT 'eligible' NOT NULL,
	CONSTRAINT "production_bags_nonnegative_index" CHECK ("production_bags"."bag_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "crm_order_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crm_order_id" uuid NOT NULL,
	"external_service_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"total_price_cents" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	CONSTRAINT "crm_order_services_prices_valid" CHECK ("crm_order_services"."total_price_cents" >= 0 and "crm_order_services"."unit_price_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "crm_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_order_id" text NOT NULL,
	"source_version" integer NOT NULL,
	"source_payload_hash" text NOT NULL,
	"status" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"bag_count" integer DEFAULT 0 NOT NULL,
	"vendor_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_orders_source_version_nonnegative" CHECK ("crm_orders"."source_version" >= 0),
	CONSTRAINT "crm_orders_bag_count_nonnegative" CHECK ("crm_orders"."bag_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "production_machines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"label" text NOT NULL,
	"manufacturer_capacity_lbs" numeric(12, 3),
	"effective_capacity_lbs" numeric(12, 3),
	"capacity_safety_margin_lbs" numeric(12, 3),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_machines_effective_capacity_positive" CHECK ("production_machines"."effective_capacity_lbs" is null or "production_machines"."effective_capacity_lbs" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_batch_orders" (
	"production_batch_id" uuid NOT NULL,
	"production_order_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "production_batch_orders_production_batch_id_production_order_id_pk" PRIMARY KEY("production_batch_id","production_order_id")
);
--> statement-breakpoint
CREATE TABLE "production_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_run_id" uuid NOT NULL,
	"sequence_index" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"pulse_capacity_lbs" numeric(12, 3) NOT NULL,
	"derived_weight_lbs" numeric(12, 3) NOT NULL,
	"pulse_minutes" integer NOT NULL,
	"planned_done_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_batches_valid_capacity" CHECK ("production_batches"."derived_weight_lbs" > 0 and "production_batches"."derived_weight_lbs" <= "production_batches"."pulse_capacity_lbs" and "production_batches"."pulse_minutes" > 0),
	CONSTRAINT "production_batches_positive_version" CHECK ("production_batches"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crm_order_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"priority" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'eligible' NOT NULL,
	"derived_weight_lbs" numeric(12, 3) NOT NULL,
	"derived_weight_source" text DEFAULT 'cents_service_price' NOT NULL,
	"must_stay_together" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"eligible_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_orders_positive_weight" CHECK ("production_orders"."derived_weight_lbs" > 0),
	CONSTRAINT "production_orders_must_stay_together" CHECK ("production_orders"."must_stay_together" = true),
	CONSTRAINT "production_orders_positive_version" CHECK ("production_orders"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_shift_id" uuid NOT NULL,
	"schedule_run_id" uuid NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_runs_positive_version" CHECK ("production_runs"."version" > 0)
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
	CONSTRAINT "production_shifts_valid_window" CHECK ("production_shifts"."ends_at" > "production_shifts"."starts_at"),
	CONSTRAINT "production_shifts_positive_folders" CHECK ("production_shifts"."effective_folder_count" > 0),
	CONSTRAINT "production_shifts_positive_version" CHECK ("production_shifts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "schedule_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "schedule_runs_nonnegative_forecasts" CHECK ("schedule_runs"."batch_count" >= 0 and "schedule_runs"."makespan_minutes" >= 0 and "schedule_runs"."pulse_capacity_lbs" > 0)
);
--> statement-breakpoint
CREATE TABLE "scheduler_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pulse_minutes" integer NOT NULL,
	"fold_lbs_per_folder_minute" numeric(12, 3) NOT NULL,
	"algorithm_version" text DEFAULT 'fixed-pulse-ffd-v1' NOT NULL,
	"version" integer NOT NULL,
	"stage_fit_assertion" jsonb NOT NULL,
	"asserted_by" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduler_configs_positive_pulse" CHECK ("scheduler_configs"."pulse_minutes" > 0),
	CONSTRAINT "scheduler_configs_positive_fold_rate" CHECK ("scheduler_configs"."fold_lbs_per_folder_minute" > 0)
);
--> statement-breakpoint
CREATE TABLE "stage_machine_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"production_batch_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"stage_kind" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"planned_start_at" timestamp with time zone NOT NULL,
	"planned_end_at" timestamp with time zone NOT NULL,
	"actual_start_at" timestamp with time zone,
	"actual_end_at" timestamp with time zone,
	"started_by" uuid,
	"completed_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stage_runs_planned_window_valid" CHECK ("stage_runs"."planned_end_at" > "stage_runs"."planned_start_at"),
	CONSTRAINT "stage_runs_known_stage" CHECK ("stage_runs"."stage_kind" in ('sorting', 'washing', 'drying', 'folding_packaging'))
);
--> statement-breakpoint
CREATE TABLE "production_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "production_stations_known_kind" CHECK ("production_stations"."kind" in ('sorting', 'washing', 'drying', 'folding_packaging'))
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"source_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_source_version_nonnegative" CHECK ("webhook_events"."source_version" >= 0),
	CONSTRAINT "webhook_events_attempts_nonnegative" CHECK ("webhook_events"."attempts" >= 0),
	CONSTRAINT "webhook_events_known_status" CHECK ("webhook_events"."status" in ('pending', 'processing', 'processed', 'dead'))
);
--> statement-breakpoint
CREATE TABLE "work_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
ALTER TABLE "production_bags" ADD CONSTRAINT "production_bags_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_order_services" ADD CONSTRAINT "crm_order_services_crm_order_id_crm_orders_id_fk" FOREIGN KEY ("crm_order_id") REFERENCES "public"."crm_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_machines" ADD CONSTRAINT "production_machines_station_id_production_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."production_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_production_batch_id_production_batches_id_fk" FOREIGN KEY ("production_batch_id") REFERENCES "public"."production_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_orders" ADD CONSTRAINT "production_batch_orders_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_production_run_id_production_runs_id_fk" FOREIGN KEY ("production_run_id") REFERENCES "public"."production_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_crm_order_id_crm_orders_id_fk" FOREIGN KEY ("crm_order_id") REFERENCES "public"."crm_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_production_shift_id_production_shifts_id_fk" FOREIGN KEY ("production_shift_id") REFERENCES "public"."production_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_schedule_run_id_schedule_runs_id_fk" FOREIGN KEY ("schedule_run_id") REFERENCES "public"."schedule_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_production_shift_id_production_shifts_id_fk" FOREIGN KEY ("production_shift_id") REFERENCES "public"."production_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_scheduler_config_id_scheduler_configs_id_fk" FOREIGN KEY ("scheduler_config_id") REFERENCES "public"."scheduler_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_machine_assignments" ADD CONSTRAINT "stage_machine_assignments_stage_run_id_stage_runs_id_fk" FOREIGN KEY ("stage_run_id") REFERENCES "public"."stage_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_machine_assignments" ADD CONSTRAINT "stage_machine_assignments_machine_id_production_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."production_machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_production_batch_id_production_batches_id_fk" FOREIGN KEY ("production_batch_id") REFERENCES "public"."production_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_runs" ADD CONSTRAINT "stage_runs_station_id_production_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."production_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_bags_order_index_unique" ON "production_bags" USING btree ("production_order_id","bag_index");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_order_services_external_unique" ON "crm_order_services" USING btree ("crm_order_id","external_service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_orders_external_order_unique" ON "crm_orders" USING btree ("external_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_machines_label_unique" ON "production_machines" USING btree ("station_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "production_batch_orders_active_unique" ON "production_batch_orders" USING btree ("production_order_id") WHERE "production_batch_orders"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "production_batches_sequence_unique" ON "production_batches" USING btree ("production_run_id","sequence_index");--> statement-breakpoint
CREATE UNIQUE INDEX "production_orders_crm_order_unique" ON "production_orders" USING btree ("crm_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_runs_schedule_unique" ON "production_runs" USING btree ("schedule_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_runs_canonical_proposal_unique" ON "schedule_runs" USING btree ("production_shift_id","scheduler_config_id","input_snapshot_hash","output_plan_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduler_configs_version_unique" ON "scheduler_configs" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_machine_assignments_stage_machine_unique" ON "stage_machine_assignments" USING btree ("stage_run_id","machine_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_runs_batch_stage_unique" ON "stage_runs" USING btree ("production_batch_id","stage_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "production_stations_kind_unique" ON "production_stations" USING btree ("location_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_external_event_unique" ON "webhook_events" USING btree ("external_event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_claimable_idx" ON "webhook_events" USING btree ("status","available_at","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "work_events_idempotency_unique" ON "work_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "work_events_entity_idx" ON "work_events" USING btree ("entity_type","entity_id","created_at");
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "stage_machine_assignments"
ADD CONSTRAINT "stage_machine_assignments_no_overlap"
EXCLUDE USING gist (
  "machine_id" WITH =,
  tstzrange("planned_start_at", "planned_end_at", '[)') WITH &&
)
WHERE ("status" IN ('planned', 'active'));
