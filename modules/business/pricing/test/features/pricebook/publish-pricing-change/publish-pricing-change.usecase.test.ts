import { result } from '@pressly/kernel';
import { describe, expect, it } from 'vitest';
import { makePublishPricingChange } from '../../../../src/features/pricebook/publish-pricing-change/publish-pricing-change.usecase.ts';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import { makePricingChangeCommand } from '../../../support/pricing-change.builder.ts';
import { makeFakePricingChangeStore } from '../../../support/pricing-change-store.fake.ts';

const fixedClock = {
  now: () => new Date('2026-05-21T12:00:00.000Z'),
};

describe('publish pricing change usecase', () => {
  it('loads current pricing, creates a plan, and commits it', async () => {
    const {
      loadCurrentPricing,
      publishPricingChange: publish,
      calls,
    } = makeFakePricingChangeStore();
    const publishPricingChange = makePublishPricingChange({
      loadCurrentPricing,
      publishPricingChange: publish,
      clock: fixedClock,
    });

    const actual = await publishPricingChange(makePricingChangeCommand());

    const value = expectOk(actual);

    expect(value).toEqual({
      oldPricingSetId: 'set_1',
      newPricingSetId: 'set_2',
      auditEventId: 'event_1',
      changeItemCount: 1,
    });

    expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
    expect(calls.commit).toHaveLength(1);
    expect(calls.commit[0]?.publishedAt).toEqual(
      new Date('2026-05-21T12:00:00.000Z'),
    );
    expect(calls.commit[0]?.plan).toEqual({
      serviceSlug: 'wash-fold',
      reason: 'Update delivery fee',
      oldPricingSetId: 'set_1',
      currency: 'USD',
      changes: [
        {
          code: 'delivery_fee',
          name: 'Delivery fee',
          oldPriceCents: 495,
          newPriceCents: 100,
        },
      ],
    });
  });

  it('allows publishing free delivery', async () => {
    const {
      loadCurrentPricing,
      publishPricingChange: publish,
      calls,
    } = makeFakePricingChangeStore();
    const publishPricingChange = makePublishPricingChange({
      loadCurrentPricing,
      publishPricingChange: publish,
      clock: fixedClock,
    });

    const actual = await publishPricingChange(
      makePricingChangeCommand({
        reason: 'Remove delivery fee',
        items: [{ code: 'delivery_fee', priceCents: 0 }],
      }),
    );

    expectOk(actual);
    expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
    expect(calls.commit[0]?.plan.changes).toEqual([
      {
        code: 'delivery_fee',
        name: 'Delivery fee',
        oldPriceCents: 495,
        newPriceCents: 0,
      },
    ]);
  });

  it('rejects invalid commands before loading pricing', async () => {
    const {
      loadCurrentPricing,
      publishPricingChange: publish,
      calls,
    } = makeFakePricingChangeStore();
    const publishPricingChange = makePublishPricingChange({
      loadCurrentPricing,
      publishPricingChange: publish,
      clock: fixedClock,
    });

    const actual = await publishPricingChange(
      makePricingChangeCommand({
        items: [{ code: 'hang_dry', priceCents: 0 }],
      }),
    );

    expectErrCode(actual, 'invalid_pricing_item_price');
    expect(calls.load).toEqual([]);
    expect(calls.commit).toEqual([]);
  });

  it('returns load failures without committing', async () => {
    const loadFailure = {
      code: 'active_pricing_set_not_found',
      serviceSlug: 'wash-fold',
    } as const;
    const {
      loadCurrentPricing,
      publishPricingChange: publish,
      calls,
    } = makeFakePricingChangeStore({
      loadResult: result.err(loadFailure),
    });
    const publishPricingChange = makePublishPricingChange({
      loadCurrentPricing,
      publishPricingChange: publish,
      clock: fixedClock,
    });

    const actual = await publishPricingChange(makePricingChangeCommand());

    expectErrCode(actual, 'active_pricing_set_not_found');
    expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
    expect(calls.commit).toEqual([]);
  });

  it('rejects no-op pricing changes without committing', async () => {
    const {
      loadCurrentPricing,
      publishPricingChange: publish,
      calls,
    } = makeFakePricingChangeStore();
    const publishPricingChange = makePublishPricingChange({
      loadCurrentPricing,
      publishPricingChange: publish,
      clock: fixedClock,
    });

    const actual = await publishPricingChange(
      makePricingChangeCommand({
        items: [{ code: 'delivery_fee', priceCents: 495 }],
      }),
    );

    expectErrCode(actual, 'pricing_change_has_no_changes');
    expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
    expect(calls.commit).toEqual([]);
  });

  it('returns commit conflicts as expected failures', async () => {
    const commitFailure = {
      code: 'pricing_state_changed',
      expectedPricingSetId: 'set_1',
      actualPricingSetId: 'set_2',
    } as const;
    const {
      loadCurrentPricing,
      publishPricingChange: publish,
      calls,
    } = makeFakePricingChangeStore({
      commitResult: result.err(commitFailure),
    });
    const publishPricingChange = makePublishPricingChange({
      loadCurrentPricing,
      publishPricingChange: publish,
      clock: fixedClock,
    });

    const actual = await publishPricingChange(makePricingChangeCommand());

    expectErrCode(actual, 'pricing_state_changed');
    expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
    expect(calls.commit).toHaveLength(1);
  });
});
