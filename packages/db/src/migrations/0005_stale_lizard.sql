CREATE TYPE "public"."auth_scope_kind" AS ENUM('global', 'location', 'resource');--> statement-breakpoint
CREATE TABLE "auth_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"role" "auth_role" NOT NULL,
	"scope_kind" "auth_scope_kind" NOT NULL,
	"scope_id" text DEFAULT '*' NOT NULL,
	"scope_resource_type" text DEFAULT '*' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_identity_id" uuid,
	CONSTRAINT "auth_role_assignments_scope_shape_check" CHECK (
        (
          "auth_role_assignments"."scope_kind" = 'resource'
          and "auth_role_assignments"."scope_resource_type" <> '*'
        )
        or
        (
          "auth_role_assignments"."scope_kind" <> 'resource'
          and "auth_role_assignments"."scope_resource_type" = '*'
        )
      )
);
--> statement-breakpoint
ALTER TABLE "auth_role_assignments" ADD CONSTRAINT "auth_role_assignments_identity_id_auth_identites_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_role_assignments" ADD CONSTRAINT "auth_role_assignments_created_by_identity_id_auth_identites_id_fk" FOREIGN KEY ("created_by_identity_id") REFERENCES "public"."auth_identites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_role_assignments_identity_idx" ON "auth_role_assignments" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "auth_role_assignments_scope_idx" ON "auth_role_assignments" USING btree ("scope_kind","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_role_assignments_unique_idx" ON "auth_role_assignments" USING btree ("identity_id","role","scope_kind","scope_id","scope_resource_type");--> statement-breakpoint
INSERT INTO "auth_role_assignments" (
	"identity_id",
	"role",
	"scope_kind",
	"scope_id",
	"scope_resource_type",
	"created_at",
	"created_by_identity_id"
)
SELECT DISTINCT ON ("identity_id", "role")
	"identity_id",
	"role",
	'global',
	'*',
	'*',
	"created_at",
	"created_by_identity_id"
FROM "auth_identity_roles"
ORDER BY "identity_id", "role", "created_at";
