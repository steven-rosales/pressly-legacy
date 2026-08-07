import { describe, expect, it, vi } from 'vitest';
import { makeWithdrawFulfillment } from '../../../../src/features/fulfillment/withdraw-fulfillment/withdraw-fulfillment.usecase.ts';
import type { FulfillmentReleaseTransactionOperations } from '../../../../src/foundations/ports/fulfillment-release-transaction/fulfillment-release-transaction.port.ts';
import {
  orderCommandTestAggregate,
  orderCommandTestBusinessId,
  orderCommandTestClock,
  orderCommandTestContext,
  transactionRepository,
} from '../../../support/order-command.fixture.ts';

describe('withdraw fulfillment', () => {
  it('rejects withdrawal after the release lifecycle is terminal', async () => {
    const applyFulfillmentRelease = vi.fn();
    const operations: FulfillmentReleaseTransactionOperations = {
      lockCommand: vi.fn(),
      loadCommandReceipt: vi.fn().mockResolvedValue(null),
      saveCommandReceipt: vi.fn(),
      findOrderId: vi.fn().mockResolvedValue('order-1'),
      lockOrder: vi.fn(),
      lockFulfillment: vi.fn(),
      loadFulfillmentOrder: vi.fn().mockResolvedValue({
        ...orderCommandTestAggregate,
        fulfillment: {
          ...orderCommandTestAggregate.fulfillment,
          releaseState: 'withdrawn',
        },
      }),
      applyFulfillmentRelease,
    };
    const withdraw = makeWithdrawFulfillment({
      repo: transactionRepository(operations),
      clock: orderCommandTestClock,
    });

    const outcome = await withdraw({
      businessId: orderCommandTestBusinessId,
      idempotencyKey: 'withdraw-fulfillment-001',
      context: orderCommandTestContext,
      reasonCode: 'commercial_canceled',
      reasonNote: null,
      locationId: 'east',
      fulfillmentId: 'fulfillment-1',
      expectedOrderVersion: 2,
      expectedFulfillmentVersion: 2,
    });

    expect(outcome).toMatchObject({
      tag: 'err',
      error: { code: 'fulfillment_transition_invalid' },
    });
    expect(applyFulfillmentRelease).not.toHaveBeenCalled();
  });
});
