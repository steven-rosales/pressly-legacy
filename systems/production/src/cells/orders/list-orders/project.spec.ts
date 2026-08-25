import { describe, expect, it } from 'vitest';
import {
  productionDueBucket,
  projectOrdersResult,
  projectProductionOrder,
} from './project.ts';

const row = {
  id: '00000000-0000-4000-8000-000000000001',
  locationId: 'location-1',
  externalOrderId: 'ORDER-1',
  dueAt: new Date('2026-08-22T04:00:00.000Z'),
  priority: false,
  status: 'eligible',
  derivedWeightLbs: 25,
  bagCount: 1,
  bagCountSource: 'operator_intake',
  intakeVersion: 1,
  version: 2,
} as const;

describe('list-orders projection', () => {
  it('derives location-local due buckets across the UTC boundary', () => {
    const asOf = new Date('2026-08-21T14:00:00.000Z');
    expect(
      productionDueBucket(
        new Date('2026-08-22T03:59:59.999Z'),
        asOf,
        'America/New_York',
      ),
    ).toBe('today');
    expect(productionDueBucket(row.dueAt, asOf, 'America/New_York')).toBe(
      'tomorrow',
    );
  });

  it('preserves intake provenance and serializes dates only at output', () => {
    const asOf = new Date('2026-08-21T14:00:00.000Z');
    const order = projectProductionOrder(row, asOf, 'America/New_York');
    expect(
      projectOrdersResult({ items: [order], nextCursor: null, asOf }),
    ).toMatchObject({
      items: [
        {
          externalOrderId: 'ORDER-1',
          dueAt: '2026-08-22T04:00:00.000Z',
          dueBucket: 'tomorrow',
          bagCountProvenance: 'operator_intake',
          intakeVersion: 1,
        },
      ],
      asOf: '2026-08-21T14:00:00.000Z',
    });
  });

  it('rejects stored intake contradictions', () => {
    expect(() =>
      projectProductionOrder(
        { ...row, bagCountSource: null },
        new Date(),
        'America/New_York',
      ),
    ).toThrow(
      expect.objectContaining({ code: 'production_bag_count_state_invalid' }),
    );
  });
});
