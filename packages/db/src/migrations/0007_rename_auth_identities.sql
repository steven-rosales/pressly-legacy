DO $$
BEGIN
  IF to_regclass('public.auth_identites') IS NOT NULL
    AND to_regclass('public.auth_identities') IS NULL THEN
    ALTER TABLE "auth_identites" RENAME TO "auth_identities";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identites_pkey'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identities_pkey'
  ) THEN
    ALTER TABLE "auth_identities"
      RENAME CONSTRAINT "auth_identites_pkey" TO "auth_identities_pkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identites_email_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identities_email_unique'
  ) THEN
    ALTER TABLE "auth_identities"
      RENAME CONSTRAINT "auth_identites_email_unique" TO "auth_identities_email_unique";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identites_email_normalized_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identities_email_normalized_unique'
  ) THEN
    ALTER TABLE "auth_identities"
      RENAME CONSTRAINT "auth_identites_email_normalized_unique" TO "auth_identities_email_normalized_unique";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_audit_events_actor_identity_id_auth_identites_id_fk'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_audit_events_actor_identity_id_auth_identities_id_fk'
  ) THEN
    ALTER TABLE "auth_audit_events"
      RENAME CONSTRAINT "auth_audit_events_actor_identity_id_auth_identites_id_fk" TO "auth_audit_events_actor_identity_id_auth_identities_id_fk";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identity_roles_identity_id_auth_identites_id_fk'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identity_roles_identity_id_auth_identities_id_fk'
  ) THEN
    ALTER TABLE "auth_identity_roles"
      RENAME CONSTRAINT "auth_identity_roles_identity_id_auth_identites_id_fk" TO "auth_identity_roles_identity_id_auth_identities_id_fk";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identity_roles_created_by_identity_id_auth_identites_id_fk'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identity_roles_created_by_identity_id_auth_identities_id_fk'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identity_roles_created_by_identity_id_auth_identities_id_f'
  ) THEN
    ALTER TABLE "auth_identity_roles"
      RENAME CONSTRAINT "auth_identity_roles_created_by_identity_id_auth_identites_id_fk" TO "auth_identity_roles_created_by_identity_id_auth_identities_id_fk";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_login_attempts_identity_id_auth_identites_id_fk'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_login_attempts_identity_id_auth_identities_id_fk'
  ) THEN
    ALTER TABLE "auth_login_attempts"
      RENAME CONSTRAINT "auth_login_attempts_identity_id_auth_identites_id_fk" TO "auth_login_attempts_identity_id_auth_identities_id_fk";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_password_credentials_identity_id_auth_identites_id_fk'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_password_credentials_identity_id_auth_identities_id_fk'
  ) THEN
    ALTER TABLE "auth_password_credentials"
      RENAME CONSTRAINT "auth_password_credentials_identity_id_auth_identites_id_fk" TO "auth_password_credentials_identity_id_auth_identities_id_fk";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_identity_id_auth_identites_id_fk'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_identity_id_auth_identities_id_fk'
  ) THEN
    ALTER TABLE "auth_sessions"
      RENAME CONSTRAINT "auth_sessions_identity_id_auth_identites_id_fk" TO "auth_sessions_identity_id_auth_identities_id_fk";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_role_assignments_identity_id_auth_identites_id_fk'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_role_assignments_identity_id_auth_identities_id_fk'
  ) THEN
    ALTER TABLE "auth_role_assignments"
      RENAME CONSTRAINT "auth_role_assignments_identity_id_auth_identites_id_fk" TO "auth_role_assignments_identity_id_auth_identities_id_fk";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_role_assignments_created_by_identity_id_auth_identites_id_fk'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_role_assignments_created_by_identity_id_auth_identities_id_fk'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_role_assignments_created_by_identity_id_auth_identities_id'
  ) THEN
    ALTER TABLE "auth_role_assignments"
      RENAME CONSTRAINT "auth_role_assignments_created_by_identity_id_auth_identites_id_fk" TO "auth_role_assignments_created_by_identity_id_auth_identities_id_fk";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_role_assignments_created_by_identity_id_auth_identites_id_'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_role_assignments_created_by_identity_id_auth_identities_id_fk'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_role_assignments_created_by_identity_id_auth_identities_id'
  ) THEN
    ALTER TABLE "auth_role_assignments"
      RENAME CONSTRAINT "auth_role_assignments_created_by_identity_id_auth_identites_id_" TO "auth_role_assignments_created_by_identity_id_auth_identities_id_fk";
  END IF;
END $$;
