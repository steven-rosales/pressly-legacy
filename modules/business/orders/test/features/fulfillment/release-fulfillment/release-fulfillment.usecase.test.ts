import { describe, expect, it, vi } from 'vitest';
import { makeReleaseFulfillment } from '../../../../src/features/fulfillment/release-fulfillment/release-fulfillment.usecase.ts';
import type { FulfillmentReleaseTransactionOperations } from '../../../../src/foundations/ports/fulfillment-release-transaction/fulfillment-release-transaction.port.ts';
import {
  orderCommandTestAggregate,
  orderCommandTestBusinessId,
  orderCommandTestClock,
  orderCommandTestContext,
  transactionRepository,
} from '../../../support/order-command.fixture.ts';

const command = (idempotencyKey: string) => ({
  businessId: orderCommandTestBusinessId,
  idempotencyKey,
  context: orderCommandTestContext,
  reasonCode: 'ready_for_production' as const,
  reasonNote: null,
  locationId: 'east',
  fulfillmentId: 'fulfillment-1',
  expectedOrderVersion: 2,
  expectedFulfillmentVersion: 2,
});

describe('release fulfillment', () => {
  it('locks Order before fulfillment and commits the release decision', async () => {
    const calls: string[] = [];
    const applyFulfillmentRelease = vi.fn();
    const operations: FulfillmentReleaseTransactionOperations = {
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
      loadFulfillmentOrder: vi
        .fn()
        .mockResolvedValue(orderCommandTestAggregate),
      applyFulfillmentRelease,
    };
    const release = makeReleaseFulfillment({
      repo: transactionRepository(operations),
      clock: orderCommandTestClock,
    });

    const outcome = await release(command('release-fulfillment-001'));

    expect(outcome).toMatchObject({ tag: 'ok', value: { version: 3 } });
    expect(calls).toEqual(['order', 'fulfillment']);
    expect(applyFulfillmentRelease).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'released' }),
    );
  });

  it('rejects a terminal release state and a mismatched location before writing', async () => {
    const applyFulfillmentRelease = vi.fn();
    const baseOperations: FulfillmentReleaseTransactionOperations = {
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
    const releaseTerminal = makeReleaseFulfillment({
      repo: transactionRepository(baseOperations),
      clock: orderCommandTestClock,
    });
    const releaseWrongLocation = makeReleaseFulfillment({
      repo: transactionRepository({
        ...baseOperations,
        loadFulfillmentOrder: vi
          .fn()
          .mockResolvedValue(orderCommandTestAggregate),
      }),
      clock: orderCommandTestClock,
    });

    await expect(
      releaseTerminal(command('release-terminal')),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'fulfillment_transition_invalid' },
    });
    await expect(
      releaseWrongLocation({
        ...command('release-wrong-location'),
        locationId: 'west',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'fulfillment_not_found' },
    });
    expect(applyFulfillmentRelease).not.toHaveBeenCalled();
  });
});
