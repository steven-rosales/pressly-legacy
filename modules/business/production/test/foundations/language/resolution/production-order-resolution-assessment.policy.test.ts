import { describe, expect, it } from 'vitest';
import {
  assessProductionOrderResolution,
  toProductionOrderResolutionAvailability,
} from '../../../../src/foundations/language/resolution/production-order-resolution.policy.ts';
import { allowPolicy } from '../../../support/production.fake.ts';

const facts = {
  resolutionState: 'open',
  executionStatus: 'unassigned',
  operationalStatus: 'intake_pending',
  expectedVersion: 7,
  hasShiftSelection: false,
  hasBatchMembership: false,
  hasStageAttempt: false,
  hasRoute: false,
  hasIntake: false,
  hasManualAdmission: false,
  isPriority: false,
  hasPendingPlacement: false,
} as const;

describe('production order resolution assessment', () => {
  it('allows never-produced work from canonical Production facts', () => {
    expect(
      toProductionOrderResolutionAvailability(
        assessProductionOrderResolution(allowPolicy, facts),
      ),
    ).toEqual({
      status: 'allowed',
      expectedVersion: 7,
      requiresExplicitReview: false,
      reviewReasons: [],
    });
  });

  it('requires explicit review when Pressly owns physical intake facts', () => {
    expect(
      toProductionOrderResolutionAvailability(
        assessProductionOrderResolution(allowPolicy, {
          ...facts,
          hasIntake: true,
        }),
      ),
    ).toEqual({
      status: 'allowed',
      expectedVersion: 7,
      requiresExplicitReview: true,
      reviewReasons: ['intake_recorded'],
    });
  });

  it('blocks an order with production participation', () => {
    expect(
      toProductionOrderResolutionAvailability(
        assessProductionOrderResolution(allowPolicy, {
          ...facts,
          hasBatchMembership: true,
        }),
      ),
    ).toEqual({
      status: 'blocked',
      reasons: ['batch_membership_exists'],
    });
  });
});
