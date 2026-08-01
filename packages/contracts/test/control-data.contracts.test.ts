import { describe, expect, it } from 'vitest';
import {
  controlCreateOrderRequestSchema,
  controlCustomerListQuerySchema,
  controlCustomerSchema,
  controlOrderListQuerySchema,
  controlOrderSchema,
} from '../src/index.ts';

describe('Control customer and Order contracts', () => {
  it('coerces bounded list filters without accepting unknown tenant fields', () => {
    expect(
      controlCustomerListQuerySchema.parse({
        active: 'true',
        limit: '25',
        query: 'Ada',
      }),
    ).toEqual({ active: true, limit: 25, query: 'Ada' });
    expect(
      controlOrderListQuerySchema.safeParse({
        businessId: '00000000-0000-4000-8000-000000000100',
      }).success,
    ).toBe(false);
  });

  it('requires recognizable customer and canonical Order versions', () => {
    expect(
      controlCustomerSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000010',
        version: 1,
        active: true,
        firstName: 'Ada',
        lastName: 'Lovelace',
        businessName: null,
        phone: '+12015550100',
        email: 'ada@example.com',
        displayName: 'Ada Lovelace',
        possibleDuplicateCount: 0,
        createdAt: '2026-07-29T12:00:00.000Z',
        updatedAt: '2026-07-29T12:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      controlOrderSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000020',
        version: 2,
        displayNumber: 'P-100',
        state: 'open',
        dueAt: '2026-07-29T20:00:00.000Z',
        currency: 'USD',
        totalAmountCents: 3000,
        balanceDueCents: 3000,
        customer: {
          resolution: 'resolved',
          userId: '00000000-0000-4000-8000-000000000010',
          displayName: 'Ada Lovelace',
          phone: '+12015550100',
          email: 'ada@example.com',
        },
        fulfillment: {
          id: '00000000-0000-4000-8000-000000000030',
          version: 1,
          typeCode: 'wash_fold',
          locationId: 'east',
          releaseState: 'unreleased',
          estimatedWeightLbs: 18,
          estimatedWeightSource: 'customer_estimate',
          bagCount: null,
        },
        createdAt: '2026-07-29T12:00:00.000Z',
        updatedAt: '2026-07-29T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('requires an exact canonical customer for first-party Order entry', () => {
    const input = {
      idempotencyKey: 'control-order-create-001',
      reasonCode: 'new_customer_order',
      reasonNote: null,
      displayNumber: 'P-101',
      dueAt: '2026-07-29T20:00:00.000Z',
      currency: 'USD',
      totalAmountCents: 3000,
      balanceDueCents: 3000,
      items: [],
      fulfillment: {
        typeCode: 'wash_fold',
        locationId: 'east',
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
      },
    } as const;
    expect(
      controlCreateOrderRequestSchema.safeParse({
        ...input,
        customer: {
          resolution: 'resolved',
          userId: '00000000-0000-4000-8000-000000000010',
        },
      }).success,
    ).toBe(true);
    expect(
      controlCreateOrderRequestSchema.safeParse({
        ...input,
        customer: { resolution: 'not_provided', userId: null },
      }).success,
    ).toBe(false);
  });
});
