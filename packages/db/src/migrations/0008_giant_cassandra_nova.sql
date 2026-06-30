DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth_identity_roles legacy
    LEFT JOIN auth_role_assignments assignment
      ON assignment.identity_id = legacy.identity_id
      AND assignment.role = legacy.role
      AND assignment.scope_kind = 'global'
      AND assignment.scope_id = '*'
      AND assignment.scope_resource_type = '*'
    WHERE assignment.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'auth_identity_roles contains roles that are missing from auth_role_assignments';
  END IF;

  IF EXISTS (
    SELECT identity_id
    FROM auth_password_credentials
    GROUP BY identity_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'an identity has more than one password credential';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "auth_identity_roles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "auth_identity_roles";--> statement-breakpoint
ALTER TABLE "auth_audit_events" RENAME COLUMN "actor_identity_id" TO "principal_identity_id";--> statement-breakpoint
ALTER TABLE "auth_audit_events" DROP CONSTRAINT "auth_audit_events_actor_identity_id_auth_identities_id_fk";
--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "last_used_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "auth_sessions"
SET "last_used_at" = "issued_at"
WHERE "last_used_at" IS NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "last_used_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_audit_events" ADD CONSTRAINT "auth_audit_events_principal_identity_id_auth_identities_id_fk" FOREIGN KEY ("principal_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_password_credentials_identity_unique" ON "auth_password_credentials" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_identity_idx" ON "auth_sessions" USING btree ("identity_id");
