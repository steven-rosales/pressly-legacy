import { result } from '@pressly/kernel';
import { describe, expect, it } from 'vitest';
import { makePlanPricingChange } from '../../../../src/features/pricebook/plan-pricing-change/plan-pricing-change.usecase.ts';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import {
  makeCurrentPricingItems,
  makePricingChangeCommand,
} from '../../../support/pricing-change.builder.ts';
import { makeFakePricingChangeStore } from '../../../support/pricing-change-store.fake.ts';

describe('plan pricing change usecase', () => {
  it('loads current pricing and returns a diff without committing', async () => {
    const { loadCurrentPricing, calls } = makeFakePricingChangeStore({
      current: {
        currentSet: {
          id: 'set_1',
          currency: 'USD',
        },
        currentItems: makeCurrentPricingItems([
          {
            code: 'delivery_fee',
            name: 'Delivery Fee',
            priceCents: 495,
          },
          {
            code: 'hang_dry',
            name: 'Hang Dry',
            priceCents: 295,
          },
        ]),
      },
    });
    const planPricingChange = makePlanPricingChange(loadCurrentPricing);

    const actual = await planPricingChange(
      makePricingChangeCommand({
        items: [
          { code: 'delivery_fee', priceCents: 595 },
          { code: 'hang_dry', priceCents: 295 },
        ],
      }),
    );

    const value = expectOk(actual);

    expect(value).toEqual({
      serviceSlug: 'wash-fold',
      reason: 'Update delivery fee',
      oldPricingSetId: 'set_1',
      currency: 'USD',
      changes: [
        {
          code: 'delivery_fee',
          name: 'Delivery Fee',
          oldPriceCents: 495,
          newPriceCents: 595,
        },
      ],
    });
    expect(calls.load).toEqual([
      {
        serviceSlug: 'wash-fold',
      },
    ]);
    expect(calls.commit).toEqual([]);
  });

  it('rejects command policy violations before loading current pricing', async () => {
    const { loadCurrentPricing, calls } = makeFakePricingChangeStore();
    const planPricingChange = makePlanPricingChange(loadCurrentPricing);

    const actual = await planPricingChange(
      makePricingChangeCommand({
        reason: 'short',
      }),
    );

    expectErrCode(actual, 'pricing_change_reason_too_short');
    expect(calls.load).toEqual([]);
    expect(calls.commit).toEqual([]);
  });

  it('returns store load failures unchanged', async () => {
    const loadFailure = {
      code: 'active_pricing_set_not_found',
      serviceSlug: 'wash-fold',
    } as const;
    const { loadCurrentPricing, calls } = makeFakePricingChangeStore({
      loadResult: result.err(loadFailure),
    });
    const planPricingChange = makePlanPricingChange(loadCurrentPricing);

    const actual = await planPricingChange(makePricingChangeCommand());

    expectErrCode(actual, 'active_pricing_set_not_found');
    expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
    expect(calls.commit).toEqual([]);
  });

  it('rejects unknown pricing item codes after loading current pricing', async () => {
    const { loadCurrentPricing, calls } = makeFakePricingChangeStore();
    const planPricingChange = makePlanPricingChange(loadCurrentPricing);

    const actual = await planPricingChange(
      makePricingChangeCommand({
        items: [{ code: 'missing_item', priceCents: 100 }],
      }),
    );

    expectErrCode(actual, 'pricing_item_code_not_found');
    expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
    expect(calls.commit).toEqual([]);
  });
});
