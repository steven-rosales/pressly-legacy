import { type Database } from '@pressly/db/client';
import * as pricing from '@pressly/db/schema/pricing';
import { makeAppError } from '@pressly/errors/app-error';

type PricingServiceRow = typeof pricing.pricingServices.$inferSelect;
type PricingSetRow = typeof pricing.pricingSets.$inferSelect;
type PricingItemRow = typeof pricing.pricingItems.$inferSelect;

type PricingItemFixture = Partial<
  Pick<
    PricingItemRow,
    | 'code'
    | 'service'
    | 'category'
    | 'name'
    | 'unit'
    | 'priceCents'
    | 'sortOrder'
    | 'metadata'
  >
>;

const missingReturnedRow = (message: string): never => {
  throw makeAppError({
    kind: 'DatabaseError',
    code: 'pricing_test_fixture_insert_failed',
    message,
    safeMessage: 'Pricing test fixture setup failed.',
    status: 500,
  });
};

export const insertPricingService = async (
  db: Database,
  input: Partial<
    Pick<PricingServiceRow, 'slug' | 'kind' | 'label' | 'isActive'>
  > = {},
): Promise<PricingServiceRow> => {
  const [service] = await db
    .insert(pricing.pricingServices)
    .values({
      slug: input.slug ?? 'wash-fold',
      kind: input.kind ?? 'wash_fold',
      label: input.label ?? 'Wash & Fold',
      isActive: input.isActive ?? true,
    })
    .returning();

  return service ?? missingReturnedRow('Pricing service was not inserted.');
};

export const insertPricingSetWithItems = async (
  db: Database,
  input: Readonly<{
    serviceId: string;
    status?: string;
    currency?: string;
    effectiveFrom?: Date;
    effectiveTo?: Date;
    items?: readonly PricingItemFixture[];
  }>,
): Promise<
  Readonly<{
    set: PricingSetRow;
    items: readonly PricingItemRow[];
  }>
> => {
  const now = new Date('2026-05-21T12:00:00.000Z');
  const [set] = await db
    .insert(pricing.pricingSets)
    .values({
      serviceId: input.serviceId,
      status: input.status ?? 'active',
      currency: input.currency ?? 'USD',
      effectiveFrom: input.effectiveFrom ?? now,
      ...(input.effectiveTo === undefined
        ? {}
        : { effectiveTo: input.effectiveTo }),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const insertedSet =
    set ?? missingReturnedRow('Pricing set was not inserted.');

  const fixtureItems = input.items ?? [
    {
      code: 'delivery_fee',
      service: 'wash_fold',
      category: 'Fee',
      name: 'Delivery Fee',
      unit: 'order',
      priceCents: 495,
      sortOrder: 30,
      metadata: {},
    },
  ];

  if (fixtureItems.length === 0) return { set: insertedSet, items: [] };

  const items = await db
    .insert(pricing.pricingItems)
    .values(
      fixtureItems.map((item, index) => {
        const code = item.code ?? `item_${index}`;

        return {
          pricingSetId: insertedSet.id,
          code,
          service: item.service ?? 'wash_fold',
          category: item.category ?? 'Fee',
          name:
            item.name ??
            (code === 'delivery_fee' ? 'Delivery Fee' : `Item ${index}`),
          unit: item.unit ?? 'order',
          priceCents: item.priceCents ?? 495,
          sortOrder: item.sortOrder ?? index,
          metadata: item.metadata ?? {},
          createdAt: now,
          updatedAt: now,
        };
      }),
    )
    .returning();

  return { set: insertedSet, items };
};
