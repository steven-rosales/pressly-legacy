import { describe, expect, it, vi } from 'vitest';
import { externalServiceError } from '@pressly/errors/factories';
import {
  decodeProductionOrderCursor,
  encodeProductionOrderCursor,
} from '../../../../src/features/orders/list-orders/production-order-cursor.contract.mapper.ts';
import { mapProductionOrderListItem } from '../../../../src/foundations/language/orders/production-order-list-item.projection.ts';
import type { ListProductionOrdersRepository } from '../../../../src/features/orders/list-orders/list-production-orders.port.ts';
import { makeListProductionOrders } from '../../../../src/features/orders/list-orders/list-production-orders.usecase.ts';

const orderId = '00000000-0000-4000-8000-000000000001';
const fixedNow = new Date('2026-07-12T14:00:00.000Z');
const command = {
  locationId: 'location-a',
  limit: 50,
} as const;

const captureThrown = (work: () => unknown): unknown => {
  try {
    work();
  } catch (error) {
    return error;
  }
  throw new Error('Expected work to throw.');
};

const setup = (repo: ListProductionOrdersRepository) =>
  makeListProductionOrders({ repo, clock: { now: () => fixedNow } });

describe('list production orders', () => {
  it('throws classified repository failures and preserves existing application errors', async () => {
    const cause = new Error('database unavailable');
    const failed = setup({ listOrders: vi.fn().mockRejectedValue(cause) });

    await expect(failed(command)).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'production_order_list_failed',
      status: 503,
      cause,
    });

    const existing = externalServiceError({
      code: 'production_read_dependency_unavailable',
      message: 'Read dependency unavailable.',
      status: 502,
    });
    const preserved = setup({
      listOrders: vi.fn().mockRejectedValue(existing),
    });
    await expect(preserved(command)).rejects.toBe(existing);
  });

  it('returns a location-scoped page without sibling orders', async () => {
    const listOrders = vi.fn(async (received) => ({
      tag: 'found' as const,
      value: {
        items: [
          {
            id: orderId,
            locationId: received.locationId,
            externalOrderId: 'C-1001',
            dueAt: new Date('2026-07-12T20:00:00.000Z'),
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
        asOf: fixedNow,
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
      error: { code: 'production_location_not_found', kind: 'not_found' },
    });
  });

  it('returns a bounded client error for a malformed cursor', async () => {
    const list = setup({
      listOrders: async () => ({ tag: 'invalid_cursor' }),
    });

    await expect(list({ ...command, cursor: 'bad' })).resolves.toMatchObject({
      tag: 'err',
      error: {
        code: 'production_order_cursor_invalid',
        kind: 'validation',
        classification: 'malformed',
      },
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
    expect(
      mapProductionOrderListItem(row, fixedNow, 'America/New_York'),
    ).toEqual({
      id: orderId,
      locationId: 'location-a',
      externalOrderId: 'C-1001',
      dueAt: new Date('2026-07-13T16:00:00.000Z'),
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

  it('distinguishes a past due date from the current day', () => {
    expect(
      mapProductionOrderListItem(
        { ...row, dueAt: new Date('2026-07-11T16:00:00.000Z') },
        fixedNow,
        'America/New_York',
      ).dueBucket,
    ).toBe('overdue');
    expect(
      mapProductionOrderListItem(
        { ...row, dueAt: new Date('2026-07-12T01:00:00.000Z') },
        fixedNow,
        'America/New_York',
      ).dueBucket,
    ).toBe('overdue');
    expect(
      mapProductionOrderListItem(
        { ...row, dueAt: new Date('2026-07-12T04:00:00.000Z') },
        fixedNow,
        'America/New_York',
      ).dueBucket,
    ).toBe('today');
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
        'America/New_York',
      ),
    ).toMatchObject({
      status: 'eligible',
      bagCount: 2,
      bagCountProvenance: 'operator_intake',
      intakeVersion: 1,
    });
  });

  it('rejects persistence states that fabricate or lose intake truth', () => {
    const missingIntake = captureThrown(() =>
      mapProductionOrderListItem(
        { ...row, status: 'eligible' },
        fixedNow,
        'America/New_York',
      ),
    );
    expect(missingIntake).toMatchObject({
      tag: 'AppError',
      kind: 'InvariantViolationError',
      code: 'production_bag_intake_state_invalid',
      message: 'A non-pending order is missing bag intake.',
      safeMessage: 'Stored production order data is inconsistent.',
      status: 500,
      details: { status: 'eligible', bagCount: null },
    });
    expect((missingIntake as { publicDetails?: unknown }).publicDetails).toBe(
      undefined,
    );

    const mismatchedProvenance = captureThrown(() =>
      mapProductionOrderListItem(
        {
          ...row,
          bagCount: 2,
          bagCountSource: null,
          intakeVersion: 1,
        },
        fixedNow,
        'America/New_York',
      ),
    );
    expect(mismatchedProvenance).toMatchObject({
      tag: 'AppError',
      kind: 'InvariantViolationError',
      code: 'production_bag_count_state_invalid',
      message: 'Bag count and provenance disagree in persistence.',
      safeMessage: 'Stored production order data is inconsistent.',
      status: 500,
      details: { bagCount: 2, bagCountProvenance: null },
    });
  });

  it('encodes an opaque stable cursor and rejects malformed cursors', () => {
    const cursor = encodeProductionOrderCursor(orderId);
    expect(cursor).toBe('MDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAx');
    expect(cursor).not.toContain(orderId);
    expect(decodeProductionOrderCursor(cursor)).toBe(orderId);
    expect(decodeProductionOrderCursor('not-a-valid-order-cursor')).toBeNull();
  });
});
