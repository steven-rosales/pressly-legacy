create table if not exists pricing_change_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  actor_id text not null,
  actor_kind text not null,
  actor_display_name text not null,
  service_slug text not null,
  location_slug text,
  reason text not null,
  old_pricing_set_id uuid not null references pricing_sets(id),
  new_pricing_set_id uuid not null references pricing_sets(id),
  input jsonb not null,
  created_at timestamptz not null default now()
);
