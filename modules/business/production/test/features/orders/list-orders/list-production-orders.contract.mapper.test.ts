import { describe, expect, it } from 'vitest';
import {
  toListProductionOrdersCommand,
  toListProductionOrdersResult,
} from '../../../../src/features/orders/list-orders/list-production-orders.contract.mapper.ts';

describe('list production orders boundary mapping', () => {
  it('maps validated query timestamps into application Dates', () => {
    expect(
      toListProductionOrdersCommand('location-a', {
        status: 'eligible',
        dueAfter: '2026-07-12T12:00:00.000Z',
        dueBefore: '2026-07-13T12:00:00.000Z',
        cursor: 'opaque-cursor',
        limit: 25,
      }),
    ).toEqual({
      locationId: 'location-a',
      status: 'eligible',
      dueAfter: new Date('2026-07-12T12:00:00.000Z'),
      dueBefore: new Date('2026-07-13T12:00:00.000Z'),
      cursor: 'opaque-cursor',
      limit: 25,
    });
  });

  it('serializes page timestamps only at the response edge', () => {
    expect(
      toListProductionOrdersResult({
        items: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            locationId: 'location-a',
            externalOrderId: 'C-1001',
            dueAt: new Date('2026-07-12T20:00:00.000Z'),
            dueBucket: 'today',
            priority: false,
            status: 'intake_pending',
            derivedWeightLbs: 74,
            bagCount: null,
            bagCountProvenance: null,
            intakeVersion: null,
            version: 1,
          },
        ],
        nextCursor: null,
        asOf: new Date('2026-07-12T14:00:00.000Z'),
      }),
    ).toEqual({
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          locationId: 'location-a',
          externalOrderId: 'C-1001',
          dueAt: '2026-07-12T20:00:00.000Z',
          dueBucket: 'today',
          priority: false,
          status: 'intake_pending',
          derivedWeightLbs: 74,
          bagCount: null,
          bagCountProvenance: null,
          intakeVersion: null,
          version: 1,
        },
      ],
      nextCursor: null,
      asOf: '2026-07-12T14:00:00.000Z',
    });
  });
});
