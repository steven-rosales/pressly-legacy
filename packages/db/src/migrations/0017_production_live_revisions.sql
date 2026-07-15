ALTER TABLE "production_locations"
ADD COLUMN "live_revision" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "production_locations" AS location
SET "live_revision" = event_count."count"
FROM (
  SELECT "location_id", count(*)::bigint AS "count"
  FROM "work_events"
  GROUP BY "location_id"
) AS event_count
WHERE location."id" = event_count."location_id";
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
