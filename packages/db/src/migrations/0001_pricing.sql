create extension if not exists pgcrypto;
--> statement-breakpoint

create table if not exists pricing_services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind text not null,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint

create table if not exists pricing_locations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint

-- Versioning
create table if not exists pricing_sets (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references pricing_services(id),
  location_id uuid references pricing_locations(id),
  status text not null default 'active',
  currency text not null default 'USD',
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint

create table if not exists pricing_items (
  id uuid primary key default gen_random_uuid(),
  pricing_set_id uuid not null references pricing_sets(id),
  code text not null,
  service text not null,
  category text not null,
  name text not null,
  unit text not null,
  price_cents integer not null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint

create unique index if not exists pricing_sets_active_default_unique
on pricing_sets(service_id)
where location_id is null and status = 'active';
--> statement-breakpoint

create unique index if not exists pricing_sets_active_location_unique
on pricing_sets(service_id, location_id)
where location_id is not null and status = 'active';
--> statement-breakpoint

create unique index if not exists pricing_items_code_per_set_unique
on pricing_items(pricing_set_id, code);
