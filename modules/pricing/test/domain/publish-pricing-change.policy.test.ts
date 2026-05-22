import { describe, expect, it } from 'vitest';
import type { PublishPricingChangeCommand } from '@pressly/contracts';
import {
  makePricingChangePlan,
  validatePricingCommand,
  validatePricingPlan,
} from '../../src/domain/publish-pricing-change.policy.ts';

const actor = {
  id: 'user_1',
  kind: 'user',
  displayName: 'Steven',
  role: 'admin',
} satisfies PublishPricingChangeCommand['actor'];

describe('publish pricing change policy', () => {
  it('creates a pricing change plan from a valid global command', () => {
    const command: PublishPricingChangeCommand = {
      serviceSlug: 'wash-fold',
      reason: 'Update delivery fee',
      actor,
      items: [{ code: 'delivery_fee', priceCents: 100 }],
    };

    const result = makePricingChangePlan({
      command,
      currentSet: { id: 'set_1', currency: 'USD' },
      currentItems: [
        {
          code: 'delivery_fee',
          name: 'Delivery Fee',
          priceCents: 495,
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
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
    });
  });

  it('preserves location scope and returns only changed items', () => {
    const command: PublishPricingChangeCommand = {
      serviceSlug: 'dry-cleaning',
      locationSlug: 'fort-lee',
      reason: 'Update local dry cleaning prices',
      actor,
      items: [
        { code: 'delivery_fee', priceCents: 595 },
        { code: 'shirts', priceCents: 495 },
        { code: 'pants', priceCents: 995 },
      ],
    };

    const result = makePricingChangePlan({
      command,
      currentSet: { id: 'set_2', currency: 'USD' },
      currentItems: [
        {
          code: 'delivery_fee',
          name: 'Delivery Fee',
          priceCents: 495,
        },
        {
          code: 'shirts',
          name: 'Shirts',
          priceCents: 495,
        },
        {
          code: 'pants',
          name: 'Pants',
          priceCents: 895,
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        serviceSlug: 'dry-cleaning',
        locationSlug: 'fort-lee',
        reason: 'Update local dry cleaning prices',
        oldPricingSetId: 'set_2',
        currency: 'USD',
        changes: [
          {
            code: 'delivery_fee',
            name: 'Delivery Fee',
            oldPriceCents: 495,
            newPriceCents: 595,
          },
          {
            code: 'pants',
            name: 'Pants',
            oldPriceCents: 895,
            newPriceCents: 995,
          },
        ],
      },
    });
  });

  it('reports command-level policy violations', () => {
    const command: PublishPricingChangeCommand = {
      serviceSlug: 'wash-fold',
      reason: 'short',
      actor,
      items: [
        { code: 'delivery_fee', priceCents: 100 },
        { code: 'delivery_fee', priceCents: 0 },
      ],
    };

    expect(validatePricingCommand(command)).toEqual([
      {
        code: 'pricing_change_reason_too_short',
        minimumLength: 8,
        actualLength: 5,
      },
      {
        code: 'duplicate_pricing_item_code',
        itemCode: 'delivery_fee',
      },
      {
        code: 'invalid_pricing_item_price',
        itemCode: 'delivery_fee',
        priceCents: 0,
      },
    ]);
  });

  it('reports unknown item codes', () => {
    const command: PublishPricingChangeCommand = {
      serviceSlug: 'wash-fold',
      reason: 'Update delivery fee',
      actor,
      items: [{ code: 'unknown_item', priceCents: 100 }],
    };

    const result = makePricingChangePlan({
      command,
      currentSet: { id: 'set_1', currency: 'USD' },
      currentItems: [
        {
          code: 'delivery_fee',
          name: 'Delivery Fee',
          priceCents: 495,
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      violations: [
        {
          code: 'pricing_item_code_not_found',
          itemCode: 'unknown_item',
        },
        {
          code: 'pricing_change_has_no_changes',
        },
      ],
    });
  });

  it('reports no-op plans', () => {
    expect(
      validatePricingPlan({
        serviceSlug: 'wash-fold',
        reason: 'Update delivery fee',
        oldPricingSetId: 'set_1',
        currency: 'USD',
        changes: [],
      }),
    ).toEqual([
      {
        code: 'pricing_change_has_no_changes',
      },
    ]);
  });
});
