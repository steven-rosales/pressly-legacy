import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@pressly/db';
import { makePricingModule, type PricingRouteSecurity } from '../src/main.ts';

describe('pricing module composition', () => {
  it('exposes pricing routes and usecases', () => {
    const auth: PricingRouteSecurity = {
      authenticate: vi.fn() as unknown as RequestHandler,
      planPricingChange: vi.fn() as unknown as RequestHandler,
      publishPricingChange: vi.fn() as unknown as RequestHandler,
      readAuthor: vi.fn(() => ({
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'human' as const,
        displayName: 'Admin User',
      })),
    };

    const module = makePricingModule({ db: {} as Database, auth });

    expect(module.routes).toBeDefined();
    expect(module.actions).toEqual({
      loadCatalog: expect.any(Function),
      planChange: expect.any(Function),
      publishChange: expect.any(Function),
    });
  });
});
