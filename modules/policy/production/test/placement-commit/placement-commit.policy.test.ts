import { describe, expect, it } from 'vitest';
import { evaluatePlacementCommit } from '../../src/placement-commit/placement-commit.policy.ts';

const valid = {
  runStatus: 'started',
  orderStatus: 'eligible',
  orderAlreadyAssigned: false,
  expectedQueueVersion: 4,
  actualQueueVersion: 4,
  placementType: 'automatic',
  actorRole: 'operator',
  orderWeightLbs: 40,
  pulseCapacityLbs: 100,
  overtime: {
    required: false,
    proposalHash: 'proposal-1',
    confirmation: null,
  },
} as const;

describe('placement commit policy', () => {
  it('allows an operator to commit current, physically valid automatic work', () => {
    expect(evaluatePlacementCommit(valid)).toEqual({
      tag: 'ok',
      value: { commit: true },
    });
  });

  it.each([
    [{ ...valid, runStatus: 'completed' }, 'PRODUCTION_RUN_NOT_STARTED'],
    [{ ...valid, orderStatus: 'scheduled' }, 'ORDER_NOT_ELIGIBLE'],
    [{ ...valid, orderAlreadyAssigned: true }, 'ORDER_ALREADY_PLACED'],
    [{ ...valid, actualQueueVersion: 5 }, 'QUEUE_VERSION_CONFLICT'],
    [{ ...valid, orderWeightLbs: 101 }, 'BATCH_CAPACITY_EXCEEDED'],
    [
      {
        ...valid,
        placementType: 'manager_exact',
        actorRole: 'operator',
      },
      'EXACT_PLACEMENT_FORBIDDEN',
    ],
  ] as const)('rejects an unsafe placement commit', (candidate, code) => {
    expect(evaluatePlacementCommit(candidate)).toMatchObject({
      tag: 'err',
      error: { code },
    });
  });

  it('binds overtime acceptance to a manager, proposal hash, and queue version', () => {
    const overtime = {
      ...valid,
      actorRole: 'owner',
      overtime: {
        required: true,
        proposalHash: 'proposal-1',
        confirmation: null,
      },
    } as const;

    expect(evaluatePlacementCommit(overtime)).toMatchObject({
      tag: 'err',
      error: { code: 'OVERTIME_CONFIRMATION_REQUIRED' },
    });
    expect(
      evaluatePlacementCommit({
        ...overtime,
        overtime: {
          ...overtime.overtime,
          confirmation: { proposalHash: 'old', queueVersion: 4 },
        },
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'OVERTIME_CONFIRMATION_STALE' },
    });
    expect(
      evaluatePlacementCommit({
        ...overtime,
        overtime: {
          ...overtime.overtime,
          confirmation: { proposalHash: 'proposal-1', queueVersion: 4 },
        },
      }),
    ).toEqual({ tag: 'ok', value: { commit: true } });
  });
});
