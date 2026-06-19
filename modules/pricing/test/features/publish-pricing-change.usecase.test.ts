import { result } from '@pressly/kernel';
import { describe, expect, it } from 'vitest';
import { makeAppError } from '@pressly/errors';
import { makePublishPricingChange } from '../../src/features/publish-pricing/publish-pricing-change.usecase.ts';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import { makePublishPricingChangeCommand } from '../support/builders.ts';
import { makeFakePricingChangeStore } from '../support/fakes.ts';

describe('publish pricing change usecase', () => {
  it('loads current pricing, creates a plan, and commits it', async () => {
    const { store, calls } = makeFakePricingChangeStore();
    const publishPricingChange = makePublishPricingChange(store, {
      now: () => new Date('2026-05-21T12:00:00.000Z'),
    });

    const actual = await publishPricingChange(
      makePublishPricingChangeCommand(),
    );

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

  it('rejects invalid commands before loading pricing', async () => {
    const { store, calls } = makeFakePricingChangeStore();
    const publishPricingChange = makePublishPricingChange(store);

    const actual = await publishPricingChange(
      makePublishPricingChangeCommand({
        items: [{ code: 'delivery_fee', priceCents: 0 }],
      }),
    );

    expectErrCode(actual, 'invalid_pricing_item_price');
    expect(calls.load).toEqual([]);
    expect(calls.commit).toEqual([]);
  });

  it('returns load failures without committing', async () => {
    const loadError = makeAppError({
      kind: 'NotFoundError',
      code: 'active_pricing_set_not_found',
      message: 'Active pricing set was not found.',
      status: 404,
    });
    const { store, calls } = makeFakePricingChangeStore({
      loadResult: result.err(loadError),
    });
    const publishPricingChange = makePublishPricingChange(store);

    const actual = await publishPricingChange(
      makePublishPricingChangeCommand(),
    );

    expectErrCode(actual, 'active_pricing_set_not_found');
    expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
    expect(calls.commit).toEqual([]);
  });

  it('rejects no-op pricing changes without committing', async () => {
    const { store, calls } = makeFakePricingChangeStore();
    const publishPricingChange = makePublishPricingChange(store);

    const actual = await publishPricingChange(
      makePublishPricingChangeCommand({
        items: [{ code: 'delivery_fee', priceCents: 495 }],
      }),
    );

    expectErrCode(actual, 'pricing_change_has_no_changes');
    expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
    expect(calls.commit).toEqual([]);
  });

  it('returns commit failures', async () => {
    const commitError = makeAppError({
      kind: 'DatabaseError',
      code: 'pricing_publish_failed',
      message: 'Failed to publish pricing change.',
      status: 500,
    });
    const { store, calls } = makeFakePricingChangeStore({
      commitResult: result.err(commitError),
    });
    const publishPricingChange = makePublishPricingChange(store);

    const actual = await publishPricingChange(
      makePublishPricingChangeCommand(),
    );

    expectErrCode(actual, 'pricing_publish_failed');
    expect(calls.load).toEqual([{ serviceSlug: 'wash-fold' }]);
    expect(calls.commit).toHaveLength(1);
  });
});
