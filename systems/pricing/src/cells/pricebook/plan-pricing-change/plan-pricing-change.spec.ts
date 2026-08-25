import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  makePricingChangePlan,
  pricingChangeCommandViolations,
  type PricingChangeCommand,
} from '../../../model/pricing-change.ts';
import { planPricingChangeCellDeclaration } from './cell.ts';
import { planPricingChangeContract } from './contract.ts';
import { makeExecutePlanPricingChange } from './execute.ts';

const author = {
  id: 'user_1',
  kind: 'human',
  displayName: 'steven',
} as const;
const command = (
  overrides: Partial<PricingChangeCommand> = {},
): PricingChangeCommand => ({
  serviceSlug: 'wash-fold',
  reason: 'Update delivery fee',
  requestedBy: author,
  items: [{ code: 'delivery_fee', priceCents: 100 }],
  ...overrides,
});
const current = {
  currentSet: { id: 'set_1', currency: 'USD' },
  currentItems: [
    { code: 'delivery_fee', name: 'Delivery Fee', priceCents: 495 },
    { code: 'hang_dry', name: 'Hang Dry', priceCents: 295 },
  ],
} as const;

proveOperation({
  operationId: 'pricing.plan-pricing-change.v1',
  declaration: planPricingChangeCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'owns the authenticated non-writing HTTP contract',
      proves: ['contract', 'protocol'],
      run: () => {
        expect(planPricingChangeContract.input.decode(command())).toEqual({
          kind: 'valid',
          value: command(),
        });
        expect(
          planPricingChangeContract.input.decode({
            ...command(),
            items: [{ code: 'delivery_fee', priceCents: 1.5 }],
          }).kind,
        ).toBe('invalid');
        expect(
          planPricingChangeContract.failure.decode({
            code: 'pricing_state_changed',
            expectedPricingSetId: 'set_1',
            actualPricingSetId: 'set_2',
          }).kind,
        ).toBe('invalid');
        expect(planPricingChangeCellDeclaration).toMatchObject({
          id: 'pricing.plan-pricing-change.v1',
          kind: 'query',
          authentication: 'required',
          authorization: { capability: 'pricing:plan', timing: 'after-input' },
          consistency: { transaction: 'none', concurrency: 'none' },
          idempotency: { required: false },
          surfaces: [
            {
              kind: 'http',
              method: 'POST',
              path: '/pricing/changes/plan',
              bodyLimit: '16kb',
              contextRequirements: ['pricing-change-author'],
            },
          ],
        });
      },
    },

    {
      name: 'decides policy violations and exact changed-item bytes',
      proves: ['decision'],
      run: () => {
        expect(
          pricingChangeCommandViolations(
            command({
              reason: 'short',
              items: [
                { code: 'delivery_fee', priceCents: 100 },
                { code: 'delivery_fee', priceCents: 0 },
                { code: 'hang_dry', priceCents: 0 },
              ],
            }),
          ),
        ).toEqual([
          {
            code: 'pricing_change_reason_too_short',
            minimumLength: 8,
            actualLength: 5,
          },
          { code: 'duplicate_pricing_item_code', itemCode: 'delivery_fee' },
          {
            code: 'invalid_pricing_item_price',
            itemCode: 'hang_dry',
            priceCents: 0,
          },
        ]);
        expect(
          makePricingChangePlan({
            command: command({
              items: [
                { code: 'delivery_fee', priceCents: 0 },
                { code: 'hang_dry', priceCents: 295 },
              ],
            }),
            ...current,
          }),
        ).toEqual({
          tag: 'ok',
          value: {
            serviceSlug: 'wash-fold',
            reason: 'Update delivery fee',
            oldPricingSetId: 'set_1',
            currency: 'USD',
            changes: [
              {
                code: 'delivery_fee',
                name: 'Delivery Fee',
                oldPriceCents: 495,
                newPriceCents: 0,
              },
            ],
          },
        });
      },
    },

    {
      name: 'executes a valid plan without any write capability',
      proves: ['executor-success'],
      run: async () => {
        const loadCurrentPricing = vi.fn(async () => result.ok(current));
        const execute = makeExecutePlanPricingChange({ loadCurrentPricing });

        await expect(execute(command())).resolves.toMatchObject({
          kind: 'success',
          value: {
            oldPricingSetId: 'set_1',
            changes: [{ code: 'delivery_fee', newPriceCents: 100 }],
          },
        });
        expect(loadCurrentPricing).toHaveBeenCalledWith('wash-fold');
        loadCurrentPricing.mockClear();
        await expect(
          execute(command({ reason: 'short' })),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'pricing_change_reason_too_short' },
        });
        expect(loadCurrentPricing).not.toHaveBeenCalled();
      },
    },

    {
      name: 'maps authenticated host context into protocol input',
      proves: ['protocol'],
      run: () => {
        const surface = planPricingChangeCellDeclaration.surfaces[0];
        expect(surface?.kind).toBe('http');
        if (surface?.kind !== 'http') return;

        expect(
          surface.toSerializedInput({
            params: {},
            query: {},
            headers: {},
            body: {
              serviceSlug: 'wash-fold',
              reason: 'Update delivery fee',
              items: [{ code: 'delivery_fee', priceCents: 100 }],
            },
            context: { pricingChangeAuthor: author },
          }),
        ).toEqual(command());
        expect(() =>
          surface.toSerializedInput({
            params: {},
            query: {},
            headers: {},
            body: {
              serviceSlug: 'wash-fold',
              reason: 'Update delivery fee',
              items: [{ code: 'delivery_fee', priceCents: 100 }],
            },
            context: {},
          }),
        ).toThrowError(
          expect.objectContaining({
            code: 'missing_auth_principal',
            status: 401,
          }),
        );
      },
    },
  ],
});

proveOperation({
  operationId: 'pricing.plan-pricing-change.v1',
  declaration: planPricingChangeCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'returns pricing_service_not_found from the authoritative reader',
      proves: ['executor-success'],
      run: async () => {
        const execute = makeExecutePlanPricingChange({
          loadCurrentPricing: async () =>
            result.err({
              code: 'pricing_service_not_found',
              serviceSlug: 'wash-fold',
            }),
        });

        await expect(execute(command())).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'pricing_service_not_found' },
        });
      },
    },
    {
      name: 'returns active_pricing_set_not_found from the authoritative reader',
      proves: ['executor-success'],
      run: async () => {
        const execute = makeExecutePlanPricingChange({
          loadCurrentPricing: async () =>
            result.err({
              code: 'active_pricing_set_not_found',
              serviceSlug: 'wash-fold',
            }),
        });

        await expect(execute(command())).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'active_pricing_set_not_found' },
        });
      },
    },
    {
      name: 'returns multiple_active_pricing_sets from the authoritative reader',
      proves: ['executor-success'],
      run: async () => {
        const execute = makeExecutePlanPricingChange({
          loadCurrentPricing: async () =>
            result.err({
              code: 'multiple_active_pricing_sets',
              serviceSlug: 'wash-fold',
            }),
        });

        await expect(execute(command())).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'multiple_active_pricing_sets' },
        });
      },
    },
    {
      name: 'returns active_pricing_set_has_no_items from the authoritative reader',
      proves: ['executor-success'],
      run: async () => {
        const execute = makeExecutePlanPricingChange({
          loadCurrentPricing: async () =>
            result.err({
              code: 'active_pricing_set_has_no_items',
              pricingSetId: 'set_1',
            }),
        });

        await expect(execute(command())).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'active_pricing_set_has_no_items' },
        });
      },
    },
    {
      name: 'returns pricing_item_code_not_found for an unknown item',
      proves: ['decision'],
      run: async () => {
        const execute = makeExecutePlanPricingChange({
          loadCurrentPricing: async () => result.ok(current),
        });

        await expect(
          execute(
            command({ items: [{ code: 'unknown_item', priceCents: 100 }] }),
          ),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'pricing_item_code_not_found' },
        });
      },
    },
    {
      name: 'returns pricing_change_has_no_changes for an identical price',
      proves: ['decision'],
      run: async () => {
        const execute = makeExecutePlanPricingChange({
          loadCurrentPricing: async () => result.ok(current),
        });

        await expect(
          execute(
            command({ items: [{ code: 'delivery_fee', priceCents: 495 }] }),
          ),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'pricing_change_has_no_changes' },
        });
      },
    },
  ],
});
