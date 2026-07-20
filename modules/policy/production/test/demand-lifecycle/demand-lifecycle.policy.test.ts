import { describe, expect, it } from 'vitest';
import {
  evaluateDemandLifecycle,
  evaluateDemandReconciliation,
} from '../../src/demand-lifecycle/demand-lifecycle.policy.ts';

describe('demand lifecycle policy', () => {
  it.each([
    ['expected', 'release_pending'],
    ['inbound', 'release_pending'],
    ['production_released', 'intake_pending'],
  ] as const)('projects %s demand without intake as %s', (phase, status) => {
    expect(
      evaluateDemandLifecycle({
        phase,
        productionStatus: null,
        currentBagCount: null,
        incomingBagCount: null,
        estimatedWeightLbs: 52,
      }),
    ).toMatchObject({
      production: { action: 'create', status },
    });
  });

  it('keeps physically received demand unschedulable while the source is lagging', () => {
    expect(
      evaluateDemandLifecycle({
        phase: 'inbound',
        productionStatus: 'release_pending',
        currentBagCount: 3,
        incomingBagCount: null,
        estimatedWeightLbs: 52,
      }),
    ).toMatchObject({
      effectiveBagCount: 3,
      production: { action: 'update', status: 'release_pending' },
    });
  });

  it('admits physically received demand after source release', () => {
    expect(
      evaluateDemandLifecycle({
        phase: 'production_released',
        productionStatus: 'release_pending',
        currentBagCount: 3,
        incomingBagCount: null,
        estimatedWeightLbs: 52,
      }),
    ).toMatchObject({
      effectiveBagCount: 3,
      production: { action: 'update', status: 'eligible' },
    });
  });

  it('retains unweighed demand without creating schedulable production work', () => {
    expect(
      evaluateDemandLifecycle({
        phase: 'expected',
        productionStatus: null,
        currentBagCount: null,
        incomingBagCount: null,
        estimatedWeightLbs: null,
      }),
    ).toMatchObject({ production: { action: 'none' } });
  });

  it('makes uncommitted production ineligible when its source estimate disappears', () => {
    expect(
      evaluateDemandLifecycle({
        phase: 'inbound',
        productionStatus: 'eligible',
        currentBagCount: 2,
        incomingBagCount: null,
        estimatedWeightLbs: null,
      }),
    ).toMatchObject({
      effectiveBagCount: 2,
      production: { action: 'update', status: 'ineligible' },
    });
  });

  it('withdraws demand that has not been physically received', () => {
    expect(
      evaluateDemandLifecycle({
        phase: 'withdrawn',
        productionStatus: 'intake_pending',
        currentBagCount: null,
        incomingBagCount: null,
        estimatedWeightLbs: 52,
      }),
    ).toMatchObject({
      production: { action: 'update', status: 'ineligible' },
      reconciliation: 'none',
    });
  });

  it('withdraws uncommitted received work and raises reconciliation', () => {
    expect(
      evaluateDemandLifecycle({
        phase: 'withdrawn',
        productionStatus: 'eligible',
        currentBagCount: 3,
        incomingBagCount: null,
        estimatedWeightLbs: 52,
      }),
    ).toMatchObject({
      production: { action: 'update', status: 'ineligible' },
      reconciliation: 'source_withdrawn',
    });
  });

  it('preserves committed production when newer source state arrives', () => {
    expect(
      evaluateDemandLifecycle({
        phase: 'post_production',
        productionStatus: 'scheduled',
        currentBagCount: 3,
        incomingBagCount: null,
        estimatedWeightLbs: 52,
      }),
    ).toMatchObject({
      production: { action: 'preserve' },
      reconciliation: 'source_ahead',
    });
  });

  it.each([
    ['post_production', 'scheduled', 'source_ahead'],
    ['withdrawn', 'eligible', 'source_withdrawn'],
    ['expected', 'finished', 'source_behind'],
    ['post_production', 'finished', 'none'],
  ] as const)('derives %s / %s reconciliation', (phase, status, expected) => {
    expect(
      evaluateDemandReconciliation({
        phase,
        productionStatus: status,
        currentBagCount: 2,
      }),
    ).toBe(expected);
  });
});
