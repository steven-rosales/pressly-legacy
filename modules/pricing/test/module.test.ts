import { describe, expect, it } from 'vitest';
import type { Database } from '@pressly/db';
import { makePricingModule } from '../src/main.ts';

describe('pricing module composition', () => {
  it('exposes http routes and admin usecases', () => {
    const module = makePricingModule({ db: {} as Database });

    expect(module.routes).toBeDefined();
    expect(module.admin).toEqual({
      loadCatalog: expect.any(Function),
      planChange: expect.any(Function),
      publishChange: expect.any(Function),
    });
  });
});
