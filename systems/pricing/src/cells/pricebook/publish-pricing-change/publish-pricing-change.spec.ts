import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import type { PricingChangeCommand } from '../../../model/pricing-change.ts';
import { publishPricingChangeCellDeclaration } from './cell.ts';
import { publishPricingChangeContract } from './contract.ts';
import { makeExecutePublishPricingChange } from './execute.ts';

const publishedAt = new Date('2026-05-21T12:00:00.000Z');
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
  operationId: 'pricing.publish-pricing-change.v1',
  declaration: publishPricingChangeCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'owns the service-partitioned publish contract and protocol',
      proves: ['contract', 'protocol'],
      run: () => {
        expect(publishPricingChangeContract.input.decode(command())).toEqual({
          kind: 'valid',
          value: command(),
        });
        expect(
          publishPricingChangeContract.failure.decode({
            code: 'pricing_state_changed',
            expectedPricingSetId: 'set_1',
            actualPricingSetId: 'set_2',
          }),
        ).toEqual({
          kind: 'valid',
          value: {
            code: 'pricing_state_changed',
            expectedPricingSetId: 'set_1',
            actualPricingSetId: 'set_2',
          },
        });
        expect(publishPricingChangeCellDeclaration).toMatchObject({
          id: 'pricing.publish-pricing-change.v1',
          kind: 'command',
          authentication: 'required',
          authorization: {
            capability: 'pricing:publish',
            timing: 'after-input',
          },
          consistency: { transaction: 'required', concurrency: 'partitioned' },
          idempotency: { required: false },
          surfaces: [
            {
              kind: 'http',
              method: 'POST',
              path: '/pricing/changes/publish',
              bodyLimit: '16kb',
              contextRequirements: ['pricing-change-author'],
            },
          ],
        });
        expect(
          publishPricingChangeCellDeclaration.consistency.concurrencyKey?.(
            command(),
          ),
        ).toBe('wash-fold');
        expect(
          publishPricingChangeCellDeclaration.authorization?.timing ===
            'after-input'
            ? publishPricingChangeCellDeclaration.authorization.scope(command())
            : null,
        ).toBe('pricing:wash-fold:global');
      },
    },

    {
      name: 'executes the exact author clock and recomputed plan once',
      proves: ['executor-success'],
      run: async () => {
        const events: string[] = [];
        const loadCurrentPricing = vi.fn(async () => {
          events.push('load');
          return result.ok(current);
        });
        const publishPricingChange = vi.fn(async () => {
          events.push('publish');
          return result.ok({
            oldPricingSetId: 'set_1',
            newPricingSetId: 'set_2',
            auditEventId: 'event_1',
            changeItemCount: 1,
          });
        });
        const execute = makeExecutePublishPricingChange({
          loadCurrentPricing,
          publishPricingChange,
          clock: {
            now: () => {
              events.push('clock');
              return publishedAt;
            },
          },
        });

        await expect(execute(command())).resolves.toMatchObject({
          kind: 'success',
          value: { auditEventId: 'event_1', changeItemCount: 1 },
        });
        expect(events).toEqual(['load', 'clock', 'publish']);
        expect(publishPricingChange).toHaveBeenCalledWith({
          command: command(),
          plan: {
            serviceSlug: 'wash-fold',
            reason: 'Update delivery fee',
            oldPricingSetId: 'set_1',
            currency: 'USD',
            changes: [
              {
                code: 'delivery_fee',
                name: 'Delivery Fee',
                oldPriceCents: 495,
                newPriceCents: 100,
              },
            ],
          },
          publishedAt,
        });
      },
    },

    {
      name: 'decides invalid current state before publish effects',
      proves: ['decision'],
      run: async () => {
        const publishPricingChange = vi.fn();
        const execute = makeExecutePublishPricingChange({
          loadCurrentPricing: async () => result.ok(current),
          publishPricingChange,
          clock: { now: () => publishedAt },
        });

        await expect(
          execute(command({ reason: 'short' })),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'pricing_change_reason_too_short' },
        });
        expect(publishPricingChange).not.toHaveBeenCalled();
      },
    },
  ],
});

proveOperation({
  operationId: 'pricing.publish-pricing-change.v1',
  declaration: publishPricingChangeCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'returns pricing_service_not_found without publishing',
      proves: ['executor-success'],
      run: async () => {
        const publishPricingChange = vi.fn();
        const execute = makeExecutePublishPricingChange({
          loadCurrentPricing: async () =>
            result.err({
              code: 'pricing_service_not_found',
              serviceSlug: 'wash-fold',
            }),
          publishPricingChange,
          clock: { now: () => publishedAt },
        });

        await expect(execute(command())).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'pricing_service_not_found' },
        });
        expect(publishPricingChange).not.toHaveBeenCalled();
      },
    },
    {
      name: 'returns active_pricing_set_not_found without publishing',
      proves: ['executor-success'],
      run: async () => {
        const publishPricingChange = vi.fn();
        const execute = makeExecutePublishPricingChange({
          loadCurrentPricing: async () =>
            result.err({
              code: 'active_pricing_set_not_found',
              serviceSlug: 'wash-fold',
            }),
          publishPricingChange,
          clock: { now: () => publishedAt },
        });

        await expect(execute(command())).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'active_pricing_set_not_found' },
        });
        expect(publishPricingChange).not.toHaveBeenCalled();
      },
    },
    {
      name: 'returns multiple_active_pricing_sets without publishing',
      proves: ['executor-success'],
      run: async () => {
        const publishPricingChange = vi.fn();
        const execute = makeExecutePublishPricingChange({
          loadCurrentPricing: async () =>
            result.err({
              code: 'multiple_active_pricing_sets',
              serviceSlug: 'wash-fold',
            }),
          publishPricingChange,
          clock: { now: () => publishedAt },
        });

        await expect(execute(command())).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'multiple_active_pricing_sets' },
        });
        expect(publishPricingChange).not.toHaveBeenCalled();
      },
    },
    {
      name: 'returns active_pricing_set_has_no_items without publishing',
      proves: ['executor-success'],
      run: async () => {
        const publishPricingChange = vi.fn();
        const execute = makeExecutePublishPricingChange({
          loadCurrentPricing: async () =>
            result.err({
              code: 'active_pricing_set_has_no_items',
              pricingSetId: 'set_1',
            }),
          publishPricingChange,
          clock: { now: () => publishedAt },
        });

        await expect(execute(command())).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'active_pricing_set_has_no_items' },
        });
        expect(publishPricingChange).not.toHaveBeenCalled();
      },
    },
    {
      name: 'returns duplicate_pricing_item_code without publishing',
      proves: ['decision'],
      run: async () => {
        const publishPricingChange = vi.fn();
        const execute = makeExecutePublishPricingChange({
          loadCurrentPricing: async () => result.ok(current),
          publishPricingChange,
          clock: { now: () => publishedAt },
        });

        await expect(
          execute(
            command({
              items: [
                { code: 'delivery_fee', priceCents: 100 },
                { code: 'delivery_fee', priceCents: 200 },
              ],
            }),
          ),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'duplicate_pricing_item_code' },
        });
        expect(publishPricingChange).not.toHaveBeenCalled();
      },
    },
    {
      name: 'returns invalid_pricing_item_price without publishing',
      proves: ['decision'],
      run: async () => {
        const publishPricingChange = vi.fn();
        const execute = makeExecutePublishPricingChange({
          loadCurrentPricing: async () => result.ok(current),
          publishPricingChange,
          clock: { now: () => publishedAt },
        });

        await expect(
          execute(command({ items: [{ code: 'hang_dry', priceCents: 0 }] })),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'invalid_pricing_item_price' },
        });
        expect(publishPricingChange).not.toHaveBeenCalled();
      },
    },
    {
      name: 'returns pricing_item_code_not_found without publishing',
      proves: ['decision'],
      run: async () => {
        const publishPricingChange = vi.fn();
        const execute = makeExecutePublishPricingChange({
          loadCurrentPricing: async () => result.ok(current),
          publishPricingChange,
          clock: { now: () => publishedAt },
        });

        await expect(
          execute(
            command({ items: [{ code: 'unknown_item', priceCents: 100 }] }),
          ),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'pricing_item_code_not_found' },
        });
        expect(publishPricingChange).not.toHaveBeenCalled();
      },
    },
  ],
});
