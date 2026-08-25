import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import {
  assessOrderCommandCapabilities,
  assessResolutionAvailability,
} from './capabilities.ts';
import type { RoutingBatch } from './types.ts';

const batch = (
  id: string,
  sequence: number,
  patch: Partial<RoutingBatch> = {},
): RoutingBatch => ({
  productionBatchId: id,
  sequence,
  status: 'queued',
  membershipFrozen: false,
  version: 1,
  derivedWeightLbs: 40,
  pulseCapacityLbs: 100,
  stages: ['sorting', 'washing', 'drying', 'folding_packaging'].map(
    (stage) => ({
      stage: stage as 'sorting' | 'washing' | 'drying' | 'folding_packaging',
      status: 'planned' as const,
      assignedWeightLbs: 40,
      capacityLbs: 100,
    }),
  ),
  ...patch,
});

describe('order control command capabilities', () => {
  it('returns exact target feasibility and command versions', () => {
    const source = batch('source', 0);
    const target = batch('target', 1, { version: 4 });
    expect(
      assessOrderCommandCapabilities(productionRules, {
        order: {
          id: 'order',
          operationalStatus: 'scheduled',
          executionStatus: 'scheduled',
          resolutionState: 'open',
          version: 3,
          weightLbs: 20,
        },
        run: { id: 'run', status: 'started', queueVersion: 5 },
        source: { ...source, activeOrderCount: 2 },
        sourceAttempts: [],
        candidates: [source, target],
      }),
    ).toMatchObject({
      queuedMove: {
        status: 'allowed',
        expectedQueueVersion: 5,
        expectedOrderVersion: 3,
        expectedSourceBatchVersion: 1,
        targets: [
          { feasibility: { code: 'TARGET_IS_SOURCE_BATCH' } },
          {
            productionBatchId: 'target',
            expectedBatchVersion: 4,
            feasibility: { status: 'allowed' },
          },
        ],
      },
      routeException: {
        status: 'blocked',
        code: 'EXCEPTION_SOURCE_NOT_IN_FLIGHT',
      },
    });
  });

  it('keeps resolution safety server-authoritative', () => {
    expect(
      assessResolutionAvailability(productionRules, {
        resolutionState: 'open',
        executionStatus: 'unassigned',
        operationalStatus: 'eligible',
        expectedVersion: 2,
        hasShiftSelection: false,
        hasBatchMembership: false,
        hasStageAttempt: false,
        hasRoute: false,
        hasIntake: false,
        hasManualAdmission: false,
        isPriority: false,
        hasPendingPlacement: false,
      }),
    ).toMatchObject({ status: 'allowed', expectedVersion: 2 });
    expect(
      assessResolutionAvailability(productionRules, {
        resolutionState: 'open',
        executionStatus: 'scheduled',
        operationalStatus: 'scheduled',
        expectedVersion: 3,
        hasShiftSelection: true,
        hasBatchMembership: true,
        hasStageAttempt: true,
        hasRoute: true,
        hasIntake: true,
        hasManualAdmission: false,
        isPriority: false,
        hasPendingPlacement: false,
      }),
    ).toMatchObject({
      status: 'blocked',
      reasons: expect.arrayContaining([
        'execution_committed',
        'selected_for_shift',
        'batch_membership_exists',
      ]),
    });
  });
});
