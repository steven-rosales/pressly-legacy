-- Custom SQL migration file, put your code below! --
CREATE EXTENSION IF NOT EXISTS pgcrypto;
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
--> statement-breakpoint
CREATE FUNCTION "pressly_notify_production_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_revision bigint;
BEGIN
  UPDATE "production_locations"
  SET "live_revision" = "live_revision" + 1
  WHERE "id" = NEW."location_id"
  RETURNING "live_revision" INTO next_revision;

  PERFORM pg_notify(
    'pressly_production_changes',
    json_build_object(
      'locationId', NEW."location_id",
      'revision', next_revision
    )::text
  );

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "work_events_notify_production_change"
AFTER INSERT ON "work_events"
FOR EACH ROW
EXECUTE FUNCTION "pressly_notify_production_change"();
--> statement-breakpoint
CREATE FUNCTION "reject_order_source_proposal_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'incoming Order proposal evidence is append-only';
END;
$$;
--> statement-breakpoint
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
$$;
--> statement-breakpoint
CREATE TRIGGER "order_source_proposals_snapshot_immutable"
BEFORE UPDATE OR DELETE ON "order_source_proposals"
FOR EACH ROW
EXECUTE FUNCTION "enforce_order_source_proposal_snapshot_immutable"();
--> statement-breakpoint
CREATE TRIGGER "order_source_proposal_resolutions_immutable"
BEFORE UPDATE OR DELETE ON "order_source_proposal_resolutions"
FOR EACH ROW
EXECUTE FUNCTION "reject_order_source_proposal_mutation"();
--> statement-breakpoint
CREATE TRIGGER "order_source_proposal_transitions_immutable"
BEFORE UPDATE OR DELETE ON "order_source_proposal_transitions"
FOR EACH ROW
EXECUTE FUNCTION "reject_order_source_proposal_mutation"();
--> statement-breakpoint
CREATE TRIGGER "order_source_terminal_tombstones_immutable"
BEFORE UPDATE OR DELETE ON "order_source_terminal_tombstones"
FOR EACH ROW
EXECUTE FUNCTION "reject_order_source_proposal_mutation"();
--> statement-breakpoint
CREATE FUNCTION "enforce_workforce_invitation_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'workforce invitations cannot be deleted';
  END IF;

  IF (
    NEW."id",
    NEW."business_id",
    NEW."email_normalized",
    NEW."display_name",
    NEW."intended_role",
    NEW."intended_location_id",
    NEW."token_hash",
    NEW."expires_at",
    NEW."created_by_identity_id",
    NEW."created_at"
  ) IS DISTINCT FROM (
    OLD."id",
    OLD."business_id",
    OLD."email_normalized",
    OLD."display_name",
    OLD."intended_role",
    OLD."intended_location_id",
    OLD."token_hash",
    OLD."expires_at",
    OLD."created_by_identity_id",
    OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'workforce invitation authority is immutable';
  END IF;

  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'workforce invitation version must advance exactly once';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "workforce_invitations_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "workforce_invitations"
FOR EACH ROW
EXECUTE FUNCTION "enforce_workforce_invitation_mutation"();
--> statement-breakpoint
CREATE FUNCTION "enforce_workforce_membership_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'workforce memberships cannot be deleted';
  END IF;

  IF (
    NEW."id",
    NEW."business_id",
    NEW."identity_id",
    NEW."started_at",
    NEW."created_at"
  ) IS DISTINCT FROM (
    OLD."id",
    OLD."business_id",
    OLD."identity_id",
    OLD."started_at",
    OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'workforce membership authority is immutable';
  END IF;

  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'workforce membership version must advance exactly once';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "workforce_memberships_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "workforce_memberships"
FOR EACH ROW
EXECUTE FUNCTION "enforce_workforce_membership_mutation"();
--> statement-breakpoint
CREATE FUNCTION "enforce_auth_access_grant_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'access grants cannot be deleted';
  END IF;

  IF (
    NEW."id",
    NEW."business_id",
    NEW."membership_id",
    NEW."identity_id",
    NEW."role",
    NEW."scope_kind",
    NEW."scope_id",
    NEW."scope_resource_type",
    NEW."location_id",
    NEW."starts_at",
    NEW."ends_at",
    NEW."created_by_identity_id",
    NEW."created_at"
  ) IS DISTINCT FROM (
    OLD."id",
    OLD."business_id",
    OLD."membership_id",
    OLD."identity_id",
    OLD."role",
    OLD."scope_kind",
    OLD."scope_id",
    OLD."scope_resource_type",
    OLD."location_id",
    OLD."starts_at",
    OLD."ends_at",
    OLD."created_by_identity_id",
    OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'access grant authority is immutable';
  END IF;

  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'access grant version must advance exactly once';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "auth_access_grants_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "auth_access_grants"
FOR EACH ROW
EXECUTE FUNCTION "enforce_auth_access_grant_mutation"();
--> statement-breakpoint
CREATE FUNCTION "reject_auth_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'auth lifecycle history is append-only';
END
$$;
--> statement-breakpoint
CREATE TRIGGER "auth_lifecycle_transitions_immutable"
BEFORE UPDATE OR DELETE ON "auth_lifecycle_transitions"
FOR EACH ROW
EXECUTE FUNCTION "reject_auth_history_mutation"();
--> statement-breakpoint
CREATE TRIGGER "auth_command_receipts_immutable"
BEFORE UPDATE OR DELETE ON "auth_command_receipts"
FOR EACH ROW
EXECUTE FUNCTION "reject_auth_history_mutation"();
--> statement-breakpoint
CREATE FUNCTION "enforce_business_retains_active_owner"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_business_id uuid;
  owner_authority_affected boolean;
BEGIN
  IF TG_TABLE_NAME = 'auth_access_grants' THEN
    IF TG_OP = 'DELETE' THEN
      target_business_id := OLD."business_id";
      owner_authority_affected := OLD."role" = 'owner';
    ELSIF TG_OP = 'INSERT' THEN
      target_business_id := NEW."business_id";
      owner_authority_affected := NEW."role" = 'owner';
    ELSE
      target_business_id := NEW."business_id";
      owner_authority_affected :=
        OLD."role" = 'owner' OR NEW."role" = 'owner';
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      target_business_id := OLD."business_id";
      owner_authority_affected := EXISTS (
        SELECT 1
        FROM "auth_access_grants"
        WHERE "membership_id" = OLD."id"
          AND "role" = 'owner'
      );
    ELSIF TG_OP = 'INSERT' THEN
      target_business_id := NEW."business_id";
      owner_authority_affected := EXISTS (
        SELECT 1
        FROM "auth_access_grants"
        WHERE "membership_id" = NEW."id"
          AND "role" = 'owner'
      );
    ELSE
      target_business_id := NEW."business_id";
      owner_authority_affected := EXISTS (
        SELECT 1
        FROM "auth_access_grants"
        WHERE "membership_id" = NEW."id"
          AND "role" = 'owner'
      );
    END IF;
  END IF;

  IF owner_authority_affected AND NOT EXISTS (
    SELECT 1
    FROM "auth_access_grants" AS grant_record
    INNER JOIN "workforce_memberships" AS membership
      ON membership."id" = grant_record."membership_id"
      AND membership."business_id" = grant_record."business_id"
      AND membership."identity_id" = grant_record."identity_id"
    INNER JOIN "auth_identities" AS identity
      ON identity."id" = grant_record."identity_id"
    WHERE grant_record."business_id" = target_business_id
      AND grant_record."role" = 'owner'
      AND grant_record."scope_kind" = 'business'
      AND grant_record."state" = 'active'
      AND (
        grant_record."starts_at" IS NULL
        OR grant_record."starts_at" <= now()
      )
      AND grant_record."ends_at" IS NULL
      AND membership."state" = 'active'
      AND identity."is_active" = true
  ) THEN
    RAISE EXCEPTION 'PRESSLY_LAST_OWNER_REQUIRED';
  END IF;

  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "auth_access_grants_last_owner_guard"
AFTER INSERT OR UPDATE OR DELETE ON "auth_access_grants"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_business_retains_active_owner"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "workforce_memberships_last_owner_guard"
AFTER INSERT OR UPDATE OR DELETE ON "workforce_memberships"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_business_retains_active_owner"();
--> statement-breakpoint
CREATE FUNCTION "enforce_identity_deactivation_retains_active_owner"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_identity_id uuid;
  target_business_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_identity_id := OLD."id";
  ELSIF OLD."is_active" = true AND NEW."is_active" = false THEN
    target_identity_id := NEW."id";
  ELSE
    RETURN NULL;
  END IF;

  FOR target_business_id IN
    SELECT DISTINCT grant_record."business_id"
    FROM "auth_access_grants" AS grant_record
    WHERE grant_record."identity_id" = target_identity_id
      AND grant_record."role" = 'owner'
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM "auth_access_grants" AS grant_record
      INNER JOIN "workforce_memberships" AS membership
        ON membership."id" = grant_record."membership_id"
        AND membership."business_id" = grant_record."business_id"
        AND membership."identity_id" = grant_record."identity_id"
      INNER JOIN "auth_identities" AS identity
        ON identity."id" = grant_record."identity_id"
      WHERE grant_record."business_id" = target_business_id
        AND grant_record."role" = 'owner'
        AND grant_record."scope_kind" = 'business'
        AND grant_record."state" = 'active'
        AND (
          grant_record."starts_at" IS NULL
          OR grant_record."starts_at" <= now()
        )
        AND grant_record."ends_at" IS NULL
        AND membership."state" = 'active'
        AND identity."is_active" = true
    ) THEN
      RAISE EXCEPTION 'PRESSLY_LAST_OWNER_REQUIRED';
    END IF;
  END LOOP;

  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "auth_identities_last_owner_guard"
AFTER UPDATE OR DELETE ON "auth_identities"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_identity_deactivation_retains_active_owner"();
