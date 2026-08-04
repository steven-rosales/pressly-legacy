import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { makeControlCustomersApplication } from '../../../../src/features/customers/manage-control-customers/manage-control-customers.usecase.ts';
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

describe('manage Control customers', () => {
  it('injects authoritative business and command context into creation', async () => {
    const create = vi.fn(async () =>
      result.ok({ userId: 'user-1', version: 1, replayed: false }),
    );
    const application = makeControlCustomersApplication({
      list: vi.fn(),
      get: vi.fn(),
      create,
      update: vi.fn(),
    });

    const outcome = await application.create({
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
