drop index if exists pricing_sets_active_location_unique;
--> statement-breakpoint

drop index if exists pricing_sets_active_default_unique;
--> statement-breakpoint

update pricing_sets
set
  status = 'archived',
  effective_to = coalesce(effective_to, now()),
  updated_at = now()
where location_id is not null
  and status = 'active';
--> statement-breakpoint

alter table pricing_change_events
drop column if exists location_slug;
--> statement-breakpoint

alter table pricing_sets
drop column if exists location_id;
--> statement-breakpoint

drop table if exists pricing_locations;
--> statement-breakpoint

create unique index if not exists pricing_sets_active_service_unique
on pricing_sets(service_id)
where status = 'active';
