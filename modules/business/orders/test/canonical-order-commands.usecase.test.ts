import { describe, expect, it, vi } from 'vitest';
import type { ChangeOrderLifecycleOperations } from '../src/change-order-lifecycle/change-order-lifecycle.port.ts';
import {
  makeCancelOrder,
  makeCompleteOrder,
} from '../src/change-order-lifecycle/change-order-lifecycle.usecase.ts';
import type { ChangeFulfillmentReleaseOperations } from '../src/change-fulfillment-release/change-fulfillment-release.port.ts';
import {
  makeReleaseFulfillment,
  makeWithdrawFulfillment,
} from '../src/change-fulfillment-release/change-fulfillment-release.usecase.ts';
import type { CorrectOrderOperations } from '../src/correct-order/correct-order.port.ts';
import { makeCorrectOrder } from '../src/correct-order/correct-order.usecase.ts';
import type { CreateOrderOperations } from '../src/create-order/create-order.port.ts';
import { makeCreateOrder } from '../src/create-order/create-order.usecase.ts';
import { hashOrderCommand } from '../src/order-command-idempotency.policy.ts';
import type { OrderTransactionPort } from '../src/order-transaction.port.ts';

const transactionRepo = <Operations>(
  operations: Operations,
): OrderTransactionPort<Operations> => ({
  transaction: (work) => work(operations),
});

const clock = { now: () => new Date('2026-07-28T16:00:00.000Z') };
const context = {
  origin: 'pressly_processor',
  principal: { kind: 'human', id: 'manager-1' },
} as const;
const aggregate = {
  order: {
    id: 'order-1',
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
      createOrder,
    };
    const create = makeCreateOrder({
      repo: transactionRepo(operations),
      clock,
    });

    const outcome = await create({
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
      applyOrderCorrection,
    };
    const correct = makeCorrectOrder({
      repo: transactionRepo(operations),
      clock,
    });
    const allowed = await correct({
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
      applyOrderCorrection,
    };
    const correct = makeCorrectOrder({
      repo: transactionRepo(baseOperations),
      clock,
    });
    const allowed = await correct({
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

  it('uses the commercial graph for completion and cancellation and replays exact receipts', async () => {
    const command = {
      idempotencyKey: 'complete-order-001',
      context,
      reasonCode: 'service_completed' as const,
      reasonNote: null,
      locationId: 'east',
      orderId: 'order-1',
      expectedVersion: 2,
    };
    const applyOrderLifecycle = vi.fn();
    const saveCommandReceipt = vi.fn();
    const operations: ChangeOrderLifecycleOperations = {
      lockCommand: vi.fn(),
      loadCommandReceipt: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          commandHash: hashOrderCommand(command),
          result: { ...mutation, version: 3 },
        }),
      saveCommandReceipt,
      lockOrder: vi.fn(),
      loadOrder: vi.fn().mockResolvedValue(aggregate),
      applyOrderLifecycle,
    };
    const complete = makeCompleteOrder({
      repo: transactionRepo(operations),
      clock,
    });

    const first = await complete(command);
    const replay = await complete(command);

    expect(first).toMatchObject({ tag: 'ok', value: { version: 3 } });
    expect(replay).toMatchObject({
      tag: 'ok',
      value: { version: 3, replayed: true },
    });
    expect(applyOrderLifecycle).toHaveBeenCalledOnce();
    expect(saveCommandReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'service_completed',
        reasonNote: null,
      }),
    );

    const cancelApply = vi.fn();
    const cancel = makeCancelOrder({
      repo: transactionRepo<ChangeOrderLifecycleOperations>({
        ...operations,
        loadCommandReceipt: vi.fn().mockResolvedValue(null),
        loadOrder: vi.fn().mockResolvedValue({
          ...aggregate,
          order: { ...aggregate.order, state: 'completed' },
        }),
        applyOrderLifecycle: cancelApply,
      }),
      clock,
    });
    await expect(
      cancel({
        idempotencyKey: 'cancel-order-001',
        context,
        reasonCode: 'customer_canceled',
        reasonNote: null,
        locationId: 'east',
        orderId: 'order-1',
        expectedVersion: 2,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'order_transition_invalid' },
    });
    expect(cancelApply).not.toHaveBeenCalled();
  });

  it('locks Order before Fulfillment, validates both versions, and uses the release graph', async () => {
    const calls: string[] = [];
    const applyFulfillmentRelease = vi.fn();
    const operations: ChangeFulfillmentReleaseOperations = {
      lockCommand: vi.fn(),
      loadCommandReceipt: vi.fn().mockResolvedValue(null),
      saveCommandReceipt: vi.fn(),
      findOrderId: vi.fn().mockResolvedValue('order-1'),
      lockOrder: vi.fn(async () => {
        calls.push('order');
      }),
      lockFulfillment: vi.fn(async () => {
        calls.push('fulfillment');
      }),
      loadFulfillmentOrder: vi.fn().mockResolvedValue(aggregate),
      applyFulfillmentRelease,
    };
    const release = makeReleaseFulfillment({
      repo: transactionRepo(operations),
      clock,
    });
    const allowed = await release({
      idempotencyKey: 'release-fulfillment-001',
      context,
      reasonCode: 'ready_for_production',
      reasonNote: null,
      locationId: 'east',
      fulfillmentId: 'fulfillment-1',
      expectedOrderVersion: 2,
      expectedFulfillmentVersion: 2,
    });
    const stale = await release({
      idempotencyKey: 'release-fulfillment-002',
      context,
      reasonCode: 'ready_for_production',
      reasonNote: null,
      locationId: 'east',
      fulfillmentId: 'fulfillment-1',
      expectedOrderVersion: 1,
      expectedFulfillmentVersion: 2,
    });

    expect(allowed).toMatchObject({ tag: 'ok', value: { version: 3 } });
    expect(calls.slice(0, 2)).toEqual(['order', 'fulfillment']);
    expect(applyFulfillmentRelease).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'released' }),
    );
    expect(stale).toMatchObject({
      tag: 'err',
      error: { code: 'fulfillment_version_conflict' },
    });

    const withdrawApply = vi.fn();
    const withdraw = makeWithdrawFulfillment({
      repo: transactionRepo<ChangeFulfillmentReleaseOperations>({
        ...operations,
        loadCommandReceipt: vi.fn().mockResolvedValue(null),
        loadFulfillmentOrder: vi.fn().mockResolvedValue({
          ...aggregate,
          fulfillment: {
            ...aggregate.fulfillment,
            releaseState: 'withdrawn',
          },
        }),
        applyFulfillmentRelease: withdrawApply,
      }),
      clock,
    });
    await expect(
      withdraw({
        idempotencyKey: 'withdraw-fulfillment-001',
        context,
        reasonCode: 'commercial_canceled',
        reasonNote: null,
        locationId: 'east',
        fulfillmentId: 'fulfillment-1',
        expectedOrderVersion: 2,
        expectedFulfillmentVersion: 2,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'fulfillment_transition_invalid' },
    });
    expect(withdrawApply).not.toHaveBeenCalled();
  });
});
