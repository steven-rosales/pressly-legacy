import { describe, expect, it } from 'vitest';
import { evaluateDemandLifecycle } from '../../../../src/foundations/language/demand/demand-lifecycle.policy.ts';

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
        estimatedWeightLbs: 52,
      }),
    ).toMatchObject({
      canonicalBagCount: 3,
      production: { action: 'update', status: 'release_pending' },
    });
  });

  it('admits physically received demand after source release', () => {
    expect(
      evaluateDemandLifecycle({
        phase: 'production_released',
        productionStatus: 'release_pending',
        currentBagCount: 3,
        estimatedWeightLbs: 52,
      }),
    ).toMatchObject({
      canonicalBagCount: 3,
      production: { action: 'update', status: 'eligible' },
    });
  });

  it('retains unweighed demand without creating schedulable production work', () => {
    expect(
      evaluateDemandLifecycle({
        phase: 'expected',
        productionStatus: null,
        currentBagCount: null,
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
        estimatedWeightLbs: null,
      }),
    ).toMatchObject({
      canonicalBagCount: 2,
      production: { action: 'update', status: 'ineligible' },
    });
  });

  it('withdraws demand that has not been physically received', () => {
    expect(
      evaluateDemandLifecycle({
        phase: 'withdrawn',
        productionStatus: 'intake_pending',
        currentBagCount: null,
        estimatedWeightLbs: 52,
      }),
    ).toMatchObject({
      production: { action: 'update', status: 'ineligible' },
    });
  });

  it('withdraws uncommitted received work without creating operator review', () => {
    expect(
      evaluateDemandLifecycle({
        phase: 'withdrawn',
        productionStatus: 'eligible',
        currentBagCount: 3,
        estimatedWeightLbs: 52,
      }),
    ).toMatchObject({
      production: { action: 'update', status: 'ineligible' },
    });
  });

  it('preserves committed production when newer source state arrives', () => {
    expect(
      evaluateDemandLifecycle({
        phase: 'post_production',
        productionStatus: 'scheduled',
        currentBagCount: 3,
        estimatedWeightLbs: 52,
      }),
    ).toMatchObject({
      production: { action: 'preserve' },
    });
  });
});
