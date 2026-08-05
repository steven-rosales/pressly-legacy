import { describe, expect, it, vi } from 'vitest';
import { makeCancelOrder } from '../../../../src/features/lifecycle/cancel-order/cancel-order.usecase.ts';
import type { OrderLifecycleTransactionOperations } from '../../../../src/foundations/ports/order-lifecycle-transaction/order-lifecycle-transaction.port.ts';
import {
  orderCommandTestAggregate,
  orderCommandTestBusinessId,
  orderCommandTestClock,
  orderCommandTestContext,
  transactionRepository,
} from '../../../support/order-command.fixture.ts';

describe('cancel Order', () => {
  it('rejects cancellation after the commercial lifecycle is terminal', async () => {
    const applyOrderLifecycle = vi.fn();
    const operations: OrderLifecycleTransactionOperations = {
      lockCommand: vi.fn(),
      loadCommandReceipt: vi.fn().mockResolvedValue(null),
      saveCommandReceipt: vi.fn(),
      lockOrder: vi.fn(),
      loadOrder: vi.fn().mockResolvedValue({
        ...orderCommandTestAggregate,
        order: { ...orderCommandTestAggregate.order, state: 'completed' },
      }),
      applyOrderLifecycle,
    };
    const cancel = makeCancelOrder({
      repo: transactionRepository(operations),
      clock: orderCommandTestClock,
    });

    const outcome = await cancel({
      businessId: orderCommandTestBusinessId,
      idempotencyKey: 'cancel-order-001',
      context: orderCommandTestContext,
      reasonCode: 'customer_canceled',
      reasonNote: null,
      locationId: 'east',
      orderId: 'order-1',
      expectedVersion: 2,
    });

    expect(outcome).toMatchObject({
      tag: 'err',
      error: { code: 'order_transition_invalid' },
    });
    expect(applyOrderLifecycle).not.toHaveBeenCalled();
  });
});
