import { describe, expect, it } from 'vitest';
import { err, makeAppError } from '@pressly/errors';
import { makePlanPricingChange } from '../../src/features/publish-pricing/plan-pricing-change.usecase.ts';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import {
  makeCurrentPricingItems,
  makePublishPricingChangeCommand,
} from '../support/builders.ts';
import { makeFakePricingChangeStore } from '../support/fakes.ts';

describe('plan pricing change usecase', () => {
  it('loads current pricing and returns a diff without committing', async () => {
    const { store, calls } = makeFakePricingChangeStore({
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
    const planPricingChange = makePlanPricingChange(store);

    const result = await planPricingChange(
      makePublishPricingChangeCommand({
        locationSlug: 'fort-lee',
        items: [
          { code: 'delivery_fee', priceCents: 595 },
          { code: 'hang_dry', priceCents: 295 },
        ],
      }),
    );

    const value = expectOk(result);

    expect(value).toEqual({
      serviceSlug: 'wash-fold',
      locationSlug: 'fort-lee',
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
        locationSlug: 'fort-lee',
      },
    ]);
    expect(calls.commit).toEqual([]);
  });

  it('rejects command policy violations before loading current pricing', async () => {
    const { store, calls } = makeFakePricingChangeStore();
    const planPricingChange = makePlanPricingChange(store);

    const result = await planPricingChange(
      makePublishPricingChangeCommand({
        reason: 'short',
      }),
    );

    expectErrCode(result, 'pricing_change_reason_too_short');
    expect(calls.load).toEqual([]);
    expect(calls.commit).toEqual([]);
  });

  it('returns store load failures unchanged', async () => {
    const loadError = makeAppError({
      kind: 'NotFoundError',
      code: 'active_pricing_set_not_found',
      message: 'Active pricing set was not found.',
      status: 404,
    });
    const { store, calls } = makeFakePricingChangeStore({
      loadResult: err(loadError),
    });
    const planPricingChange = makePlanPricingChange(store);

    const result = await planPricingChange(makePublishPricingChangeCommand());

    expectErrCode(result, 'active_pricing_set_not_found');
    expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
    expect(calls.commit).toEqual([]);
  });

  it('rejects unknown pricing item codes after loading current pricing', async () => {
    const { store, calls } = makeFakePricingChangeStore();
    const planPricingChange = makePlanPricingChange(store);

    const result = await planPricingChange(
      makePublishPricingChangeCommand({
        items: [{ code: 'missing_item', priceCents: 100 }],
      }),
    );

    expectErrCode(result, 'pricing_item_code_not_found');
    expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
    expect(calls.commit).toEqual([]);
  });
});
