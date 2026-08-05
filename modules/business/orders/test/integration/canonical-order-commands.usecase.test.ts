import { describe, expect, it, vi } from 'vitest';
import type { UnitOfWork } from '@pressly/kernel';
import type { CorrectOrderOperations } from '../../src/features/lifecycle/correct-order/correct-order.port.ts';
import { makeCorrectOrder } from '../../src/features/lifecycle/correct-order/correct-order.usecase.ts';
import type { CreateOrderOperations } from '../../src/features/lifecycle/create-order/create-order.port.ts';
import { makeCreateOrder } from '../../src/features/lifecycle/create-order/create-order.usecase.ts';

const transactionRepo = <Operations>(
  operations: Operations,
): UnitOfWork<Operations> => ({
  transaction: (work) => work(operations),
});

const clock = { now: () => new Date('2026-07-28T16:00:00.000Z') };
const businessId = '00000000-0000-4000-8000-000000000100';
const context = {
  origin: 'pressly_processor',
  principal: { kind: 'human', id: 'manager-1' },
} as const;
const aggregate = {
  order: {
    id: 'order-1',
    businessId,
    version: 2,
    customerUserId: null,
    customerResolution: 'not_provided' as const,
    displayNumber: 'P-100',
    state: 'open' as const,
    dueAt: new Date('2026-07-29T12:00:00.000Z'),
    currency: 'USD',
    totalAmountCents: 3_000,
    balanceDueCents: 3_000,
  },
  fulfillment: {
    id: 'fulfillment-1',
    businessId,
    orderId: 'order-1',
    version: 2,
    typeCode: 'wash_fold',
    locationId: 'east',
    releaseState: 'unreleased' as const,
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'operator_estimate',
    bagCount: null,
  },
};
const mutation = {
  orderId: 'order-1',
  fulfillmentId: 'fulfillment-1',
  version: 1,
  replayed: false,
} as const;

describe('canonical Order commands', () => {
  it('constructs direct creation with canonical lifecycle and intake defaults', async () => {
    const createOrder = vi.fn().mockResolvedValue(mutation);
    const saveCommandReceipt = vi.fn();
    const operations: CreateOrderOperations = {
      lockCommand: vi.fn(),
      loadCommandReceipt: vi.fn().mockResolvedValue(null),
      saveCommandReceipt,
      validateReferences: vi.fn().mockResolvedValue(true),
      createOrder,
    };
    const create = makeCreateOrder({
      repo: transactionRepo(operations),
      clock,
    });

    const outcome = await create({
      businessId,
      idempotencyKey: 'create-order-001',
      context,
      reasonCode: 'new_customer_order',
      reasonNote: null,
      customer: {
        resolution: 'not_provided',
        userId: null,
        externalUserId: null,
      },
      displayNumber: 'P-100',
      dueAt: new Date('2026-07-29T12:00:00.000Z'),
      currency: 'USD',
      totalAmountCents: 3_000,
      balanceDueCents: 3_000,
      items: [],
      fulfillment: {
        typeCode: 'wash_fold',
        locationId: 'east',
        estimatedWeightLbs: 18,
        estimatedWeightSource: 'operator_estimate',
      },
    });

    expect(outcome).toMatchObject({ tag: 'ok' });
    expect(createOrder).toHaveBeenCalledWith({
      businessId,
      order: expect.objectContaining({
        state: 'open',
        fulfillment: expect.objectContaining({
          releaseState: 'unreleased',
          bagCount: null,
        }),
      }),
      now: clock.now(),
    });
    expect(saveCommandReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'new_customer_order',
        reasonNote: null,
        context,
      }),
    );
  });

  it('corrects descriptive fields and rejects stale aggregate versions', async () => {
    const applyOrderCorrection = vi.fn();
    const operations: CorrectOrderOperations = {
      lockCommand: vi.fn(),
      loadCommandReceipt: vi.fn().mockResolvedValue(null),
      saveCommandReceipt: vi.fn(),
      lockOrder: vi.fn(),
      lockFulfillment: vi.fn(),
      loadOrder: vi.fn().mockResolvedValue(aggregate),
      customerExists: vi.fn().mockResolvedValue(true),
      applyOrderCorrection,
    };
    const correct = makeCorrectOrder({
      repo: transactionRepo(operations),
      clock,
    });
    const allowed = await correct({
      businessId,
      idempotencyKey: 'correct-order-001',
      context,
      reasonCode: 'customer_correction',
      reasonNote: null,
      locationId: 'east',
      orderId: 'order-1',
      expectedOrderVersion: 2,
      expectedFulfillmentVersion: 2,
      changes: { displayNumber: 'P-101', totalAmountCents: 3_100 },
    });
    const stale = await correct({
      businessId,
      idempotencyKey: 'correct-order-002',
      context,
      reasonCode: 'customer_correction',
      reasonNote: null,
      locationId: 'east',
      orderId: 'order-1',
      expectedOrderVersion: 1,
      expectedFulfillmentVersion: 2,
      changes: { displayNumber: 'P-102' },
    });

    expect(allowed).toMatchObject({ tag: 'ok', value: { version: 3 } });
    expect(applyOrderCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        nextOrderVersion: 3,
        nextFulfillmentVersion: 2,
      }),
    );
    expect(stale).toMatchObject({
      tag: 'err',
      error: { code: 'order_version_conflict' },
    });
    expect(applyOrderCorrection).toHaveBeenCalledTimes(1);
  });

  it('corrects descriptive facts without moving committed work', async () => {
    const applyOrderCorrection = vi.fn();
    const baseOperations: CorrectOrderOperations = {
      lockCommand: vi.fn(),
      loadCommandReceipt: vi.fn().mockResolvedValue(null),
      saveCommandReceipt: vi.fn(),
      lockOrder: vi.fn(),
      lockFulfillment: vi.fn(),
      loadOrder: vi.fn().mockResolvedValue(aggregate),
      customerExists: vi.fn().mockResolvedValue(true),
      applyOrderCorrection,
    };
    const correct = makeCorrectOrder({
      repo: transactionRepo(baseOperations),
      clock,
    });
    const allowed = await correct({
      businessId,
      idempotencyKey: 'correct-order-source-claims',
      context,
      reasonCode: 'source_discrepancy',
      reasonNote: 'Manager verified the physical order record.',
      locationId: 'east',
      orderId: 'order-1',
      expectedOrderVersion: 2,
      expectedFulfillmentVersion: 2,
      changes: {
        items: [
          {
            lineKey: 'wash-fold',
            itemType: 'service',
            code: 'WF',
            description: 'Wash and fold',
            quantity: 1,
            unit: 'order',
            unitPriceCents: 3_000,
            totalAmountCents: 3_000,
            sourceMetadata: {},
          },
        ],
        fulfillment: {
          typeCode: 'dry_clean',
          locationId: 'east',
          estimatedWeight: { lbs: 20, source: 'manager_estimate' },
        },
      },
    });

    expect(allowed).toMatchObject({ tag: 'ok', value: { version: 3 } });
    expect(applyOrderCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        nextFulfillment: expect.objectContaining({
          typeCode: 'dry_clean',
          locationId: 'east',
          estimatedWeightLbs: 20,
          estimatedWeightSource: 'manager_estimate',
          releaseState: 'unreleased',
          bagCount: null,
          version: 3,
        }),
        nextOrderVersion: 3,
        nextFulfillmentVersion: 3,
      }),
    );

    const move = await correct({
      businessId,
      idempotencyKey: 'correct-order-cross-location',
      context,
      reasonCode: 'source_discrepancy',
      reasonNote: 'Source location was wrong.',
      locationId: 'east',
      orderId: 'order-1',
      expectedOrderVersion: 2,
      expectedFulfillmentVersion: 2,
      changes: { fulfillment: { locationId: 'west' } },
    });
    expect(move).toMatchObject({
      tag: 'err',
      error: { code: 'order_location_move_requires_command' },
    });

    const committed = makeCorrectOrder({
      repo: transactionRepo<CorrectOrderOperations>({
        ...baseOperations,
        loadOrder: vi.fn().mockResolvedValue({
          ...aggregate,
          fulfillment: {
            ...aggregate.fulfillment,
            releaseState: 'released',
          },
        }),
      }),
      clock,
    });
    await expect(
      committed({
        businessId,
        idempotencyKey: 'correct-order-committed-type',
        context,
        reasonCode: 'manager_correction',
        reasonNote: 'Correcting the fulfillment type.',
        locationId: 'east',
        orderId: 'order-1',
        expectedOrderVersion: 2,
        expectedFulfillmentVersion: 2,
        changes: { fulfillment: { typeCode: 'dry_clean' } },
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'fulfillment_commitment_conflict' },
    });
  });
});
