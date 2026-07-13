import { describe, expect, it } from 'vitest';
import { evaluateProductionEligibility } from '../../src/eligibility/production-eligibility.policy.ts';

describe('production eligibility policy', () => {
  it('accepts weighted demand that is ready for production', () => {
    expect(
      evaluateProductionEligibility({
        state: 'ready_for_production',
        derivedWeightLbs: 74,
        bagCount: 2,
      }),
    ).toEqual({ tag: 'ok', value: { eligible: true } });
  });

  it.each([
    ['not_ready', 74, 2, 'ORDER_NOT_READY_FOR_PRODUCTION'],
    ['ready_for_production', 0, 2, 'ORDER_WEIGHT_INVALID'],
    ['ready_for_production', 74, null, 'ORDER_BAG_COUNT_MISSING'],
    ['ready_for_production', 74, -1, 'ORDER_BAG_COUNT_INVALID'],
  ] as const)(
    'rejects invalid eligibility input',
    (state, weight, bags, code) => {
      expect(
        evaluateProductionEligibility({
          state,
          derivedWeightLbs: weight,
          bagCount: bags,
        }),
      ).toMatchObject({ tag: 'err', error: { code } });
    },
  );
});
