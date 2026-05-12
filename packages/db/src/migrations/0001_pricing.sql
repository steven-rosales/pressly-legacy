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
--> statement-breakpoint

insert into pricing_services (slug, kind, label)
values
  ('wash-fold', 'wash_fold', 'Wash & Fold'),
  ('dry-cleaning', 'dry_cleaning', 'Dry Cleaning')
on conflict (slug) do update
set
  kind = excluded.kind,
  label = excluded.label,
  updated_at = now();
--> statement-breakpoint

insert into pricing_sets (service_id, location_id, status, currency)
select id, null, 'active', 'USD'
from pricing_services
where slug in ('wash-fold', 'dry-cleaning')
on conflict do nothing;
--> statement-breakpoint

insert into pricing_items (
  pricing_set_id,
  code,
  service,
  category,
  name,
  unit,
  price_cents,
  sort_order,
  metadata
)
select
  ps.id,
  item.code,
  item.service,
  item.category,
  item.name,
  item.unit,
  item.price_cents,
  item.sort_order,
  item.metadata::jsonb
from pricing_sets ps
join pricing_services s
  on s.id = ps.service_id
join (
  values
    ('wash-fold', 'wash_fold_per_lb', 'wash_fold', 'Base', 'Wash & Fold', 'lb', 167, 10, '{"displayUnitLabel":"/ lb"}'),
    ('wash-fold', 'wash_fold_minimum', 'wash_fold', 'Minimum', 'Minimum', 'order', 3000, 20, '{"minimumThresholdQuantity":18}'),
    ('wash-fold', 'delivery_fee', 'wash_fold', 'Fee', 'Delivery Fee', 'order', 495, 30, '{}'),
    ('wash-fold', 'hang_dry', 'wash_fold', 'Other Services', 'Hang Dry', 'item', 295, 40, '{}'),
    ('wash-fold', 'small_comforter', 'wash_fold', 'Specialty', 'Small Comforter', 'item', 995, 100, '{}'),
    ('wash-fold', 'large_comforter', 'wash_fold', 'Specialty', 'Large Comforter', 'item', 1995, 110, '{}'),
    ('wash-fold', 'duvet', 'wash_fold', 'Specialty', 'Duvet', 'item', 1495, 120, '{}'),
    ('wash-fold', 'bathmat', 'wash_fold', 'Specialty', 'Bathmat', 'item', 595, 130, '{}'),

    ('dry-cleaning', 'dry_cleaning_minimum', 'dry_cleaning', 'Minimum', 'Minimum', 'order', 3000, 10, '{}'),
    ('dry-cleaning', 'delivery_fee', 'dry_cleaning', 'Fee', 'Delivery Fee', 'order', 495, 20, '{}'),
    ('dry-cleaning', 'launder_press', 'dry_cleaning', 'Other Services', 'Launder & Press', 'item', 395, 30, '{}'),

    ('dry-cleaning', 'shirts', 'dry_cleaning', 'Tops', 'Shirts', 'item', 495, 100, '{}'),
    ('dry-cleaning', 'polo', 'dry_cleaning', 'Tops', 'Polo', 'item', 495, 110, '{}'),
    ('dry-cleaning', 'blouse', 'dry_cleaning', 'Tops', 'Blouse', 'item', 795, 120, '{}'),
    ('dry-cleaning', 'sweater', 'dry_cleaning', 'Tops', 'Sweater', 'item', 850, 130, '{}'),
    ('dry-cleaning', 'vest', 'dry_cleaning', 'Tops', 'Vest', 'item', 850, 140, '{}'),
    ('dry-cleaning', 'blazer_jacket', 'dry_cleaning', 'Tops', 'Blazer / Jacket', 'item', 995, 150, '{}'),

    ('dry-cleaning', 'shorts', 'dry_cleaning', 'Bottoms', 'Shorts', 'item', 695, 200, '{}'),
    ('dry-cleaning', 'skirt', 'dry_cleaning', 'Bottoms', 'Skirt', 'item', 695, 210, '{}'),
    ('dry-cleaning', 'pants', 'dry_cleaning', 'Bottoms', 'Pants', 'item', 895, 220, '{}'),

    ('dry-cleaning', 'casual_dress', 'dry_cleaning', 'Full Body', 'Casual Dress', 'item', 950, 300, '{}'),
    ('dry-cleaning', 'coat', 'dry_cleaning', 'Full Body', 'Coat', 'item', 1795, 310, '{}'),
    ('dry-cleaning', 'suit_full_piece', 'dry_cleaning', 'Full Body', 'Suit - Full Piece', 'item', 1890, 320, '{}'),
    ('dry-cleaning', 'formal_dress', 'dry_cleaning', 'Full Body', 'Formal Dress', 'item', 2590, 330, '{}'),

    ('dry-cleaning', 'rugs', 'dry_cleaning', 'Household', 'Rugs', 'sqft', 325, 400, '{}'),
    ('dry-cleaning', 'sheet_blanket', 'dry_cleaning', 'Household', 'Sheet / Blanket', 'item', 1295, 410, '{}'),
    ('dry-cleaning', 'tablecloth', 'dry_cleaning', 'Household', 'Tablecloth', 'item', 1895, 420, '{}'),
    ('dry-cleaning', 'curtain', 'dry_cleaning', 'Household', 'Curtain', 'item', 3795, 430, '{}'),
    ('dry-cleaning', 'comforter', 'dry_cleaning', 'Household', 'Comforter', 'item', 3995, 440, '{}'),

    ('dry-cleaning', 'napkin', 'dry_cleaning', 'Accessories', 'Napkin', 'item', 195, 500, '{}'),
    ('dry-cleaning', 'scarf', 'dry_cleaning', 'Accessories', 'Scarf', 'item', 595, 510, '{}'),
    ('dry-cleaning', 'tie', 'dry_cleaning', 'Accessories', 'Tie', 'item', 695, 520, '{}')
) as item(
  service_slug,
  code,
  service,
  category,
  name,
  unit,
  price_cents,
  sort_order,
  metadata
) on item.service_slug = s.slug
where ps.location_id is null
on conflict (pricing_set_id, code) do update
set
  service = excluded.service,
  category = excluded.category,
  name = excluded.name,
  unit = excluded.unit,
  price_cents = excluded.price_cents,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();