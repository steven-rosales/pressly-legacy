import { describe, expect, it, vi } from 'vitest';
import {
  decodeProductionOrderCursor,
  encodeProductionOrderCursor,
  mapProductionOrderListItem,
} from '../../src/list-production-orders/list-production-orders.mapper.ts';
import type { ListProductionOrdersRepository } from '../../src/list-production-orders/list-production-orders.port.ts';
import { makeListProductionOrders } from '../../src/list-production-orders/list-production-orders.usecase.ts';

const orderId = '00000000-0000-4000-8000-000000000001';
const fixedNow = new Date('2026-07-12T14:00:00.000Z');
const command = {
  locationId: 'location-a',
  limit: 50,
} as const;

const setup = (repo: ListProductionOrdersRepository) =>
  makeListProductionOrders({ repo, clock: { now: () => fixedNow } });

describe('list production orders', () => {
  it('returns a location-scoped page without sibling orders', async () => {
    const listOrders = vi.fn(async (received) => ({
      tag: 'found' as const,
      value: {
        items: [
          {
            id: orderId,
            locationId: received.locationId,
            externalOrderId: 'C-1001',
            dueAt: '2026-07-12T20:00:00.000Z',
            dueBucket: 'today' as const,
            priority: false,
            status: 'intake_pending' as const,
            derivedWeightLbs: 74,
            bagCount: null,
            bagCountProvenance: null,
            intakeVersion: null,
            version: 1,
          },
        ],
        nextCursor: null,
        asOf: fixedNow.toISOString(),
      },
    }));
    const list = setup({ listOrders });

    await expect(list(command)).resolves.toMatchObject({
      tag: 'ok',
      value: { items: [{ locationId: 'location-a' }] },
    });
    expect(listOrders).toHaveBeenCalledWith(command, fixedNow);
  });

  it('returns not-found for an unknown or inaccessible location', async () => {
    const list = setup({
      listOrders: async () => ({ tag: 'location_not_found' }),
    });

    await expect(list(command)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_location_not_found', status: 404 },
    });
  });

  it('returns a bounded client error for a malformed cursor', async () => {
    const list = setup({
      listOrders: async () => ({ tag: 'invalid_cursor' }),
    });

    await expect(list({ ...command, cursor: 'bad' })).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_cursor_invalid', status: 400 },
    });
  });
});

describe('production order read mapping', () => {
  const row = {
    id: orderId,
    locationId: 'location-a',
    externalOrderId: 'C-1001',
    dueAt: new Date('2026-07-13T16:00:00.000Z'),
    priority: false,
    status: 'intake_pending',
    derivedWeightLbs: 74,
    bagCount: null,
    bagCountSource: null,
    intakeVersion: 0,
    version: 1,
  } as const;

  it('represents missing intake honestly and derives the due bucket', () => {
    expect(mapProductionOrderListItem(row, fixedNow)).toEqual({
      id: orderId,
      locationId: 'location-a',
      externalOrderId: 'C-1001',
      dueAt: '2026-07-13T16:00:00.000Z',
      dueBucket: 'tomorrow',
      priority: false,
      status: 'intake_pending',
      derivedWeightLbs: 74,
      bagCount: null,
      bagCountProvenance: null,
      intakeVersion: null,
      version: 1,
    });
  });

  it('maps completed operator intake without changing its provenance', () => {
    expect(
      mapProductionOrderListItem(
        {
          ...row,
          status: 'eligible',
          bagCount: 2,
          bagCountSource: 'operator_intake',
          intakeVersion: 1,
        },
        fixedNow,
      ),
    ).toMatchObject({
      status: 'eligible',
      bagCount: 2,
      bagCountProvenance: 'operator_intake',
      intakeVersion: 1,
    });
  });

  it('rejects persistence states that fabricate or lose intake truth', () => {
    expect(() =>
      mapProductionOrderListItem({ ...row, status: 'eligible' }, fixedNow),
    ).toThrow(/missing bag intake/i);
    expect(() =>
      mapProductionOrderListItem(
        {
          ...row,
          bagCount: 2,
          bagCountSource: null,
          intakeVersion: 1,
        },
        fixedNow,
      ),
    ).toThrow(/provenance/i);
  });

  it('encodes an opaque stable cursor and rejects malformed cursors', () => {
    const cursor = encodeProductionOrderCursor(orderId);
    expect(cursor).not.toContain(orderId);
    expect(decodeProductionOrderCursor(cursor)).toBe(orderId);
    expect(decodeProductionOrderCursor('not-a-valid-order-cursor')).toBeNull();
  });
});
