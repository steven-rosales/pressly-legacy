import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { makeControlOrdersApplication } from '../../../../src/features/orders/manage-control-orders/manage-control-orders.usecase.ts';
import type { ControlRequestContext } from '../../../../src/foundations/language/control-context/control-context.value.ts';

const context: ControlRequestContext = {
  access: {
    business: { id: 'business-1', name: 'Pressly' },
    locations: [{ id: 'east', name: 'East', timezone: 'America/New_York' }],
    selectedLocationId: 'east',
    capabilities: [],
    applications: [],
  },
  actor: { identityId: 'identity-1', sessionId: 'session-1' },
  command: {
    origin: 'pressly_control',
    principal: { kind: 'human', id: 'identity-1' },
  },
};

describe('manage Control Orders', () => {
  it('rejects an out-of-scope location before invoking Orders', async () => {
    const list = vi.fn();
    const application = makeControlOrdersApplication({
      list,
      get: vi.fn(),
      create: vi.fn(),
      correct: vi.fn(),
    });

    const outcome = await application.list({
      context,
      locationId: 'west',
      limit: 25,
    });

    expect(outcome).toEqual({
      tag: 'err',
      error: {
        kind: 'location_not_found',
        requestedLocationId: 'west',
      },
    });
    expect(list).not.toHaveBeenCalled();
  });

  it('derives canonical customer and date values for Orders', async () => {
    const create = vi.fn(async () =>
      result.ok({
        orderId: 'order-1',
        fulfillmentId: 'fulfillment-1',
        version: 1,
        replayed: false,
      }),
    );
    const application = makeControlOrdersApplication({
      list: vi.fn(),
      get: vi.fn(),
      create,
      correct: vi.fn(),
    });

    await application.create({
      context,
      idempotencyKey: 'order-create-1',
      reasonCode: 'new_customer_order',
      reasonNote: null,
      customer: { resolution: 'resolved', userId: 'user-1' },
      displayNumber: null,
      dueAt: '2026-08-04T01:00:00.000Z',
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
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'business-1',
        customer: {
          resolution: 'resolved',
          userId: 'user-1',
          externalUserId: null,
        },
        dueAt: new Date('2026-08-04T01:00:00.000Z'),
      }),
    );
  });
});
