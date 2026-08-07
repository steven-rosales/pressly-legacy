import { describe, expect, it, vi } from 'vitest';
import { makeListControlOrders } from '../../../../src/features/orders/list-control-orders/list-control-orders.usecase.ts';
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

describe('list Control Orders', () => {
  it('rejects an out-of-scope location before invoking Orders', async () => {
    const list = vi.fn();
    const listOrders = makeListControlOrders(list);

    const outcome = await listOrders({
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
});
