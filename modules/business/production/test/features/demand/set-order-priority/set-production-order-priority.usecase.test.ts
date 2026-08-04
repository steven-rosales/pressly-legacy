import { describe, expect, it, vi } from 'vitest';
import type { SetProductionOrderPriorityRepository } from '../../../../src/features/demand/set-order-priority/set-production-order-priority.port.ts';
import { makeSetProductionOrderPriority } from '../../../../src/features/demand/set-order-priority/set-production-order-priority.usecase.ts';
import { allowPolicy } from '../../../support/production.fake.ts';

const command = {
  locationId: 'location-1',
  productionOrderId: '00000000-0000-4000-8000-000000000101',
  priority: true,
  expectedVersion: 2,
  idempotencyKey: 'priority-command-1',
  actorId: '00000000-0000-4000-8000-000000000201',
} as const;

describe('set production order priority', () => {
  it('rejects priority changes after the order is archived from active work', async () => {
    const setOrderPriority = vi.fn();
    const appendWorkEvent = vi.fn();
    const operations = {
      findWorkEvent: vi.fn(async () => null),
      lockLocationScheduling: vi.fn(async () => undefined),
      lockPriorityOrder: vi.fn(async () => ({
        version: command.expectedVersion,
        resolutionState: 'resolved_without_production',
      })),
      setOrderPriority,
      appendWorkEvent,
    };
    const repo: SetProductionOrderPriorityRepository = {
      transaction: async (work) => work(operations),
    };
    const setPriority = makeSetProductionOrderPriority({
      repo,
      policy: allowPolicy,
      clock: { now: () => new Date('2026-07-22T15:00:00.000Z') },
    });

    await expect(setPriority(command)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_resolved', kind: 'conflict' },
    });
    expect(setOrderPriority).not.toHaveBeenCalled();
    expect(appendWorkEvent).not.toHaveBeenCalled();
  });
});
