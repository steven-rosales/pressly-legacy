import { invariantViolationError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import {
  attemptAutomaticPlacementCellDeclaration,
  makeAttemptAutomaticPlacementCell,
} from './cell.ts';

describe('production.attempt-automatic-placement.v1 cell', () => {
  it('declares a headless location-partitioned command and binds it', async () => {
    expect(attemptAutomaticPlacementCellDeclaration).toMatchObject({
      id: 'production.attempt-automatic-placement.v1',
      kind: 'command',
      authentication: 'none',
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
      },
      surfaces: [],
      observability: {
        operation: 'production.attempt_automatic_placement',
      },
    });
    expect(
      attemptAutomaticPlacementCellDeclaration.consistency.concurrencyKey?.({
        locationId: 'location-1',
        productionOrderId: 'order-1',
        idempotencyKey: 'attempt-1',
        actorId: 'actor-1',
        authorizedAction: 'production:queue',
      }),
    ).toBe('location-1');

    const recordPendingRunResolution = vi.fn(async () => 'recorded' as const);
    const cell = makeAttemptAutomaticPlacementCell({
      repo: {
        transaction: async (work) =>
          work({
            lockLocationScheduling: async () => undefined,
            findStartedRuns: async () => [],
            recordPendingRunResolution,
            placeAutomatically: async () => {
              throw invariantViolationError({
                code: 'attempt_automatic_placement_unreachable_fixture',
                message: 'Automatic placement should not run in this fixture.',
              });
            },
          }),
      },
      clock: { now: () => new Date('2026-08-22T15:00:00.000Z') },
    });
    await expect(
      cell.execute({
        locationId: 'location-1',
        productionOrderId: 'order-1',
        idempotencyKey: 'attempt-1',
        actorId: 'actor-1',
        authorizedAction: 'production:queue',
      }),
    ).resolves.toEqual({ kind: 'success', value: null });
    expect(recordPendingRunResolution).toHaveBeenCalledOnce();
  });
});
