/// <reference types="node" />

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeAppError } from '@pressly/errors';
import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { createDatabaseRuntime, type Database } from '../client.ts';

loadEnv({
  path: resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../apps/api/.env.local',
  ),
});

const getDatabaseUrl = (): string => {
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw makeAppError({
      kind: 'ConfigError',
      code: 'missing_database_url',
      message: 'DATABASE_URL is required to seed pricing.',
      safeMessage: 'Database configuration is invalid.',
      status: 500,
    });
  }

  return databaseUrl;
};

export const seedPricing = async (db: Database): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into pricing_services (slug, kind, label)
      values
        ('wash-fold', 'wash_fold', 'Wash & Fold'),
        ('dry-cleaning', 'dry_cleaning', 'Dry Cleaning')
      on conflict (slug) do update
      set
        kind = excluded.kind,
        label = excluded.label,
        is_active = true,
        updated_at = now()
    `);

    await tx.execute(sql`
      insert into pricing_locations (slug, label)
      values
        ('allendale', 'Allendale'),
        ('bergenfield', 'Bergenfield'),
        ('bogota', 'Bogota'),
        ('carlstadt', 'Carlstadt'),
        ('cliffside-park', 'Cliffside Park'),
        ('closter', 'Closter'),
        ('cresskill', 'Cresskill'),
        ('demarest', 'Demarest'),
        ('dumont', 'Dumont'),
        ('east-rutherford', 'East Rutherford'),
        ('edgewater', 'Edgewater'),
        ('elmwood-park', 'Elmwood Park'),
        ('emerson', 'Emerson'),
        ('englewood', 'Englewood'),
        ('englewood-cliffs', 'Englewood Cliffs'),
        ('fair-lawn', 'Fair Lawn'),
        ('fairview', 'Fairview'),
        ('fort-lee', 'Fort Lee'),
        ('franklin-lakes', 'Franklin Lakes'),
        ('garfield', 'Garfield'),
        ('glen-rock', 'Glen Rock'),
        ('hackensack', 'Hackensack'),
        ('harrington-park', 'Harrington Park'),
        ('hasbrouck-heights', 'Hasbrouck Heights'),
        ('hillsdale', 'Hillsdale'),
        ('ho-ho-kus', 'Ho-Ho-Kus'),
        ('leonia', 'Leonia'),
        ('little-ferry', 'Little Ferry'),
        ('lodi', 'Lodi'),
        ('lyndhurst', 'Lyndhurst'),
        ('maywood', 'Maywood'),
        ('midland-park', 'Midland Park'),
        ('montvale', 'Montvale'),
        ('moonachie', 'Moonachie'),
        ('new-milford', 'New Milford'),
        ('north-arlington', 'North Arlington'),
        ('northvale', 'Northvale'),
        ('norwood', 'Norwood'),
        ('oakland', 'Oakland'),
        ('old-tappan', 'Old Tappan'),
        ('oradell', 'Oradell'),
        ('palisades-park', 'Palisades Park'),
        ('paramus', 'Paramus'),
        ('park-ridge', 'Park Ridge'),
        ('ramsey', 'Ramsey'),
        ('ridgefield', 'Ridgefield'),
        ('ridgefield-park', 'Ridgefield Park'),
        ('river-edge', 'River Edge'),
        ('rochelle-park', 'Rochelle Park'),
        ('rutherford', 'Rutherford'),
        ('saddle-brook', 'Saddle Brook'),
        ('saddle-river', 'Saddle River'),
        ('south-hackensack', 'South Hackensack'),
        ('teaneck', 'Teaneck'),
        ('tenafly', 'Tenafly'),
        ('upper-saddle-river', 'Upper Saddle River'),
        ('waldwick', 'Waldwick'),
        ('wallington', 'Wallington'),
        ('washington-township', 'Washington Township'),
        ('westwood', 'Westwood'),
        ('wood-ridge', 'Wood Ridge'),
        ('woodcliff-lake', 'Woodcliff Lake'),
        ('wyckoff', 'Wyckoff'),
        ('belleville', 'Belleville'),
        ('bloomfield', 'Bloomfield'),
        ('caldwell', 'Caldwell'),
        ('cedar-grove', 'Cedar Grove'),
        ('east-orange', 'East Orange'),
        ('essex-fells', 'Essex Fells'),
        ('fairfield', 'Fairfield'),
        ('glen-ridge', 'Glen Ridge'),
        ('irvington', 'Irvington'),
        ('maplewood', 'Maplewood'),
        ('millburn', 'Millburn'),
        ('montclair', 'Montclair'),
        ('newark', 'Newark'),
        ('north-caldwell', 'North Caldwell'),
        ('nutley', 'Nutley'),
        ('orange', 'Orange'),
        ('roseland', 'Roseland'),
        ('short-hills', 'Short Hills'),
        ('south-orange', 'South Orange'),
        ('upper-montclair', 'Upper Montclair'),
        ('verona', 'Verona'),
        ('west-caldwell', 'West Caldwell'),
        ('west-orange', 'West Orange'),
        ('bayonne', 'Bayonne'),
        ('east-newark', 'East Newark'),
        ('guttenberg', 'Guttenberg'),
        ('harrison', 'Harrison'),
        ('hoboken', 'Hoboken'),
        ('jersey-city', 'Jersey City'),
        ('kearny', 'Kearny'),
        ('north-bergen', 'North Bergen'),
        ('secaucus', 'Secaucus'),
        ('union-city', 'Union City'),
        ('weehawken', 'Weehawken'),
        ('west-new-york', 'West New York'),
        ('boonton', 'Boonton'),
        ('east-hanover', 'East Hanover'),
        ('florham-park', 'Florham Park'),
        ('hanover', 'Hanover'),
        ('lincoln-park', 'Lincoln Park'),
        ('montville', 'Montville'),
        ('morris-township', 'Morris Township'),
        ('morristown', 'Morristown'),
        ('mountain-lakes', 'Mountain Lakes'),
        ('parsippany', 'Parsippany'),
        ('pequannock-township', 'Pequannock Township'),
        ('clifton', 'Clifton'),
        ('haledon', 'Haledon'),
        ('hawthorne', 'Hawthorne'),
        ('little-falls', 'Little Falls'),
        ('north-haledon', 'North Haledon'),
        ('passaic', 'Passaic'),
        ('paterson', 'Paterson'),
        ('pompton-lakes', 'Pompton Lakes'),
        ('prospect-park', 'Prospect Park'),
        ('totowa', 'Totowa'),
        ('wayne', 'Wayne'),
        ('woodland-park', 'Woodland Park'),
        ('elizabeth', 'Elizabeth'),
        ('hillside', 'Hillside'),
        ('kenilworth', 'Kenilworth'),
        ('roselle', 'Roselle'),
        ('roselle-park', 'Roselle Park'),
        ('union', 'Union')
      on conflict (slug) do update
      set
        label = excluded.label,
        is_active = true,
        updated_at = now()
    `);

    await tx.execute(sql`
      insert into pricing_sets (service_id, location_id, status, currency)
      select service.id, null, 'active', 'USD'
      from pricing_services service
      where service.slug in ('wash-fold', 'dry-cleaning')
        and not exists (
          select 1
          from pricing_sets active_set
          where active_set.service_id = service.id
            and active_set.location_id is null
            and active_set.status = 'active'
        )
      on conflict do nothing
    `);

    await tx.execute(sql`
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
      on conflict (pricing_set_id, code) do nothing
    `);
  });
};

const entrypointUrl =
  process.argv[1] === undefined
    ? undefined
    : pathToFileURL(process.argv[1]).href;

if (import.meta.url === entrypointUrl) {
  const database = createDatabaseRuntime({ databaseUrl: getDatabaseUrl() });

  try {
    await seedPricing(database.db);
    console.log('pricing seed completed');
  } finally {
    await database.close();
  }
}
