import { describe, expect, it } from 'vitest';
import { isOrderInputValid, type OrderInput } from './order-input.ts';

const input = (overrides: Partial<OrderInput> = {}): OrderInput => ({
  displayNumber: 'P-1001',
  state: 'open',
  dueAt: new Date('2026-08-23T20:00:00.000Z'),
  currency: 'USD',
  totalAmountCents: 3_000,
  balanceDueCents: 3_000,
  items: [],
  fulfillment: {
    typeCode: 'wash_fold',
    locationId: 'east',
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'source_estimate',
    releaseState: 'unreleased',
  },
  ...overrides,
});

describe('Orders input validity', () => {
  it('preserves the deployed amount, date and weight constraints', () => {
    expect(isOrderInputValid(input())).toBe(true);
    expect(isOrderInputValid(input({ currency: 'usd' }))).toBe(false);
    expect(isOrderInputValid(input({ totalAmountCents: 1.5 }))).toBe(false);
    expect(isOrderInputValid(input({ dueAt: new Date(Number.NaN) }))).toBe(
      false,
    );
    expect(
      isOrderInputValid(
        input({
          fulfillment: {
            ...input().fulfillment,
            estimatedWeightSource: null,
          },
        }),
      ),
    ).toBe(false);
  });

  it('rejects duplicate or incomplete item identities without requiring integral quantities', () => {
    const item = {
      lineKey: 'laundry',
      itemType: 'service',
      code: 'wash_fold',
      description: 'Wash and fold',
      quantity: 1.5,
      unit: 'lb',
      unitPriceCents: 200,
      totalAmountCents: 300,
      sourceMetadata: {},
    } as const;
    expect(isOrderInputValid(input({ items: [item] }))).toBe(true);
    expect(isOrderInputValid(input({ items: [item, item] }))).toBe(false);
    expect(
      isOrderInputValid(input({ items: [{ ...item, description: ' ' }] })),
    ).toBe(false);
  });
});
