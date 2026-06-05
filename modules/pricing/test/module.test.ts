import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@pressly/db';
import { makePricingModule, type PricingModuleAuth } from '../src/main.ts';

describe('pricing module composition', () => {
  it('exposes pricing routes and usecases', () => {
    const authorize = vi.fn(() => vi.fn() as unknown as RequestHandler);
    const auth: PricingModuleAuth = {
      authenticate: vi.fn() as unknown as RequestHandler,
      authorize,
      readAuthor: vi.fn(() => ({
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'human' as const,
        displayName: 'Admin User',
      })),
      freshSessionMaxAgeMinutes: 15,
    };

    const module = makePricingModule({ db: {} as Database, auth });

    expect(module.routes).toBeDefined();
    expect(module.actions).toEqual({
      loadCatalog: expect.any(Function),
      planChange: expect.any(Function),
      publishChange: expect.any(Function),
    });
    expect(authorize).toHaveBeenCalledWith({
      action: 'pricing:read',
      roles: ['owner', 'admin'],
    });
    expect(authorize).toHaveBeenCalledWith({
      action: 'pricing:plan',
      roles: ['owner', 'admin'],
    });
    expect(authorize).toHaveBeenCalledWith({
      action: 'pricing:publish',
      roles: ['owner'],
      freshSessionMaxAgeMinutes: 15,
    });
  });
});
