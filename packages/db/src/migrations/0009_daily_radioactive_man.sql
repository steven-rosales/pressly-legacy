CREATE TYPE "public"."auth_assurance_level" AS ENUM('password', 'mfa', 'service_key');--> statement-breakpoint
CREATE TYPE "public"."auth_mfa_status" AS ENUM('pending', 'enabled');--> statement-breakpoint
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
ALTER TABLE "auth_sessions" ADD COLUMN "assurance_level" "auth_assurance_level" DEFAULT 'password' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_mfa_challenges" ADD CONSTRAINT "auth_mfa_challenges_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_mfa_credentials" ADD CONSTRAINT "auth_mfa_credentials_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_mfa_recovery_codes" ADD CONSTRAINT "auth_mfa_recovery_codes_identity_id_auth_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_mfa_challenges_identity_idx" ON "auth_mfa_challenges" USING btree ("identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_mfa_credentials_identity_unique" ON "auth_mfa_credentials" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "auth_mfa_recovery_codes_identity_idx" ON "auth_mfa_recovery_codes" USING btree ("identity_id");