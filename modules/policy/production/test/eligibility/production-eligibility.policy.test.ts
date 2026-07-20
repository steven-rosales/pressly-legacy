import { describe, expect, it } from 'vitest';
import { evaluateIntakeAdmission } from '../../src/eligibility/production-eligibility.policy.ts';

describe('production eligibility policy', () => {
  it('accepts physically received active demand', () => {
    expect(
      evaluateIntakeAdmission({
        phase: 'inbound',
        derivedWeightLbs: 74,
        bagCount: 2,
      }),
    ).toEqual({ tag: 'ok', value: { status: 'release_pending' } });
  });

  it('admits physically received source-released demand', () => {
    expect(
      evaluateIntakeAdmission({
        phase: 'production_released',
        derivedWeightLbs: 74,
        bagCount: 2,
      }),
    ).toEqual({ tag: 'ok', value: { status: 'eligible' } });
  });

  it.each([
    ['withdrawn', 74, 2, 'ORDER_DEMAND_WITHDRAWN'],
    ['post_production', 74, 2, 'ORDER_SOURCE_ALREADY_POST_PRODUCTION'],
    ['production_released', 0, 2, 'ORDER_WEIGHT_INVALID'],
    ['production_released', 74, null, 'ORDER_BAG_COUNT_MISSING'],
    ['production_released', 74, -1, 'ORDER_BAG_COUNT_INVALID'],
  ] as const)(
    'rejects invalid eligibility input',
    (phase, weight, bags, code) => {
      expect(
        evaluateIntakeAdmission({
          phase,
          derivedWeightLbs: weight,
          bagCount: bags,
        }),
      ).toMatchObject({ tag: 'err', error: { code } });
    },
  );
});
