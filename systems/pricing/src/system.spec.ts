import type { PostgresDatabase } from '@pressly/postgres/client';
import { describe, expect, it } from 'vitest';
import { makePricingSchema } from './schema/pricing.ts';
import { makePricingSystem } from './system.ts';

describe('Pricing system assembly', () => {
  it('assembles exactly the three declared Pricing operations', () => {
    const system = makePricingSystem({
      db: {} as PostgresDatabase,
      schema: makePricingSchema(),
      clock: { now: () => new Date('2026-05-21T12:00:00.000Z') },
    });

    expect(Object.keys(system.cells)).toEqual([
      'loadPricingCatalog',
      'planPricingChange',
      'publishPricingChange',
    ]);
    expect(Object.values(system.cells).map((cell) => cell.id)).toEqual([
      'pricing.load-pricing-catalog.v1',
      'pricing.plan-pricing-change.v1',
      'pricing.publish-pricing-change.v1',
    ]);
  });
});
