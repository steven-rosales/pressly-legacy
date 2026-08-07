import { describe, expect, it, vi } from 'vitest';
import { makeCompleteOrder } from '../../../../src/features/lifecycle/complete-order/complete-order.usecase.ts';
import { hashOrderCommand } from '../../../../src/foundations/language/command-execution/order-command-idempotency.policy.ts';
import type { OrderLifecycleTransactionOperations } from '../../../../src/foundations/ports/order-lifecycle-transaction/order-lifecycle-transaction.port.ts';
import {
  orderCommandTestAggregate,
  orderCommandTestBusinessId,
  orderCommandTestClock,
  orderCommandTestContext,
  transactionRepository,
} from '../../../support/order-command.fixture.ts';

describe('complete Order', () => {
  it('commits the lifecycle decision and replays an exact receipt', async () => {
    const command = {
      businessId: orderCommandTestBusinessId,
      idempotencyKey: 'complete-order-001',
      context: orderCommandTestContext,
      reasonCode: 'service_completed' as const,
      reasonNote: null,
      locationId: 'east',
      orderId: 'order-1',
      expectedVersion: 2,
    };
    const applyOrderLifecycle = vi.fn();
    const saveCommandReceipt = vi.fn();
    const operations: OrderLifecycleTransactionOperations = {
      lockCommand: vi.fn(),
      loadCommandReceipt: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          commandHash: hashOrderCommand(command),
          result: {
            orderId: 'order-1',
            fulfillmentId: 'fulfillment-1',
            version: 3,
            replayed: false,
          },
        }),
      saveCommandReceipt,
      lockOrder: vi.fn(),
      loadOrder: vi.fn().mockResolvedValue(orderCommandTestAggregate),
      applyOrderLifecycle,
    };
    const complete = makeCompleteOrder({
      repo: transactionRepository(operations),
      clock: orderCommandTestClock,
    });

    const first = await complete(command);
    const replay = await complete(command);

    expect(first).toMatchObject({ tag: 'ok', value: { version: 3 } });
    expect(replay).toMatchObject({
      tag: 'ok',
      value: { version: 3, replayed: true },
    });
    expect(applyOrderLifecycle).toHaveBeenCalledOnce();
    expect(applyOrderLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'completed' }),
    );
    expect(saveCommandReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: 'service_completed' }),
    );
  });
});
