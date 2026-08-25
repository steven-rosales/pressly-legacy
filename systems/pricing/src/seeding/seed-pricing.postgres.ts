import type { TypedPostgresDatabase } from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';
import type { PricingSchema } from '../schema/pricing.ts';

type PricingDatabase = TypedPostgresDatabase<PricingSchema>;

export const seedPricing = async (db: PricingDatabase): Promise<void> => {
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
      insert into pricing_sets (service_id, status, currency)
      select service.id, 'active', 'USD'
      from pricing_services service
      where service.slug in ('wash-fold', 'dry-cleaning')
        and not exists (
          select 1
          from pricing_sets active_set
          where active_set.service_id = service.id
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
          ('wash-fold', 'delivery_fee', 'wash_fold', 'Fee', 'Delivery Fee', 'order', 0, 30, '{}'),
          ('wash-fold', 'hang_dry', 'wash_fold', 'Other Services', 'Hang Dry', 'item', 295, 40, '{}'),
          ('wash-fold', 'small_comforter', 'wash_fold', 'Specialty', 'Small Comforter', 'item', 995, 100, '{}'),
          ('wash-fold', 'large_comforter', 'wash_fold', 'Specialty', 'Large Comforter', 'item', 1995, 110, '{}'),
          ('wash-fold', 'duvet', 'wash_fold', 'Specialty', 'Duvet', 'item', 1495, 120, '{}'),
          ('wash-fold', 'bathmat', 'wash_fold', 'Specialty', 'Bathmat', 'item', 595, 130, '{}'),
          ('dry-cleaning', 'dry_cleaning_minimum', 'dry_cleaning', 'Minimum', 'Minimum', 'order', 3000, 10, '{}'),
          ('dry-cleaning', 'delivery_fee', 'dry_cleaning', 'Fee', 'Delivery Fee', 'order', 0, 20, '{}'),
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
      on conflict (pricing_set_id, code) do nothing
    `);
  });
};
