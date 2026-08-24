import * as result from '@pressly/cells/result';
import { describe, expect, it, vi } from 'vitest';
import { makeAccessBootstrapCliSystem } from './bootstrap-cli-system.ts';

describe('Access bootstrap CLI system', () => {
  it('binds only bootstrap owner and leaves operation effects lazy', async () => {
    const bootstrapOwner = vi.fn(async () =>
      result.ok({
        identityId: '00000000-0000-4000-8000-000000000001',
        email: 'owner@example.com',
        role: 'owner' as const,
        replayed: false,
      }),
    );

    const system = makeAccessBootstrapCliSystem({ bootstrapOwner });

    expect(Object.keys(system.cells)).toEqual(['bootstrapOwner']);
    expect(bootstrapOwner).not.toHaveBeenCalled();
    await system.cells.bootstrapOwner.execute({
      businessId: '00000000-0000-4000-8000-000000000100',
      businessSlug: 'pressly-one',
      businessDisplayName: 'Pressly One',
      email: 'owner@example.com',
      password: 'Strong-password-123!',
      confirmation: 'BOOTSTRAP',
    });
    expect(bootstrapOwner).toHaveBeenCalledOnce();
  });
});
