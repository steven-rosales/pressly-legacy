import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { makeCreateControlCustomer } from '../../../../src/features/customers/create-control-customer/create-control-customer.usecase.ts';
import type { ControlRequestContext } from '../../../../src/foundations/language/control-context/control-context.value.ts';

const context: ControlRequestContext = {
  access: {
    business: { id: 'business-1', name: 'Pressly' },
    locations: [],
    selectedLocationId: null,
    capabilities: [],
    applications: [],
  },
  actor: { identityId: 'identity-1', sessionId: 'session-1' },
  command: {
    origin: 'pressly_control',
    principal: { kind: 'human', id: 'identity-1' },
  },
};

describe('create Control customer', () => {
  it('injects authoritative business and command context', async () => {
    const create = vi.fn(async () =>
      result.ok({ userId: 'user-1', version: 1, replayed: false }),
    );
    const createCustomer = makeCreateControlCustomer(create);

    const outcome = await createCustomer({
      context,
      idempotencyKey: 'customer-create-1',
      profile: {
        firstName: 'Ada',
        lastName: null,
        businessName: null,
        phone: null,
        email: null,
      },
    });

    expect(outcome.tag).toBe('ok');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'business-1',
        context: context.command,
      }),
    );
  });
});
