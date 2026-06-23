import { describe, expect, it } from 'vitest';
import type { Database } from '@pressly/db';
import { makeAuthModule } from '../src/main.ts';

describe('auth module composition', () => {
  it('exposes auth routes, guards, and usecases', () => {
    const module = makeAuthModule({
      db: {} as Database,
      tokenSecret: 'test-token-secret',
      sessionTtlMinutes: 30,
      loginWindowMinutes: 15,
      loginMaxFailures: 5,
    });

    expect(module.routes).toBeDefined();
    expect(module.guards).toEqual({
      authenticate: expect.any(Function),
      authorize: expect.any(Function),
    });
    expect(module.usecases).toEqual({
      login: expect.any(Function),
      loadSession: expect.any(Function),
      revokeSession: expect.any(Function),
    });
  });
});
