import { result } from '@pressly/kernel';
import { afterEach, describe, expect, it } from 'vitest';

import { makeApiPricingClient } from '../../../src/features/pricing/adapters/api-client.ts';
import type { SessionStore } from '../../../src/shell/session-store.ts';

const originalFetch = globalThis.fetch;

const makeSessionStore = (
  token: string | null = 'token_12345678901234567890123456789012',
): SessionStore => ({
  read: async () =>
    result.ok(
      token === null
        ? undefined
        : {
            accessToken: token,
            expiresAt: '2026-06-03T12:00:00.000Z',
            principal: {
              identityId: '00000000-0000-0000-0000-000000000001',
              displayName: 'Steven',
              roles: ['owner'],
            },
          },
    ),
  write: async () => result.ok(undefined),
  clear: async () => result.ok(undefined),
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('pricing API client', () => {
  it('sends authenticated catalog requests to the API', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];

    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            serviceSlug: 'wash-fold',
            currency: 'USD',
            updatedAt: '2026-06-03T12:00:00.000Z',
            items: [],
          },
        }),
        { status: 200 },
      );
    };

    const clientResult = makeApiPricingClient(
      { PRESSLY_API_URL: 'http://api.test' },
      makeSessionStore(),
    );

    expect(result.isOk(clientResult)).toBe(true);
    if (result.isErr(clientResult)) return;

    const catalogResult = await clientResult.value.loadCatalog({
      serviceSlug: 'wash-fold',
    });

    expect(result.isOk(catalogResult)).toBe(true);
    expect(calls).toHaveLength(1);

    const call = calls[0];
    expect(call).toBeDefined();
    if (call === undefined) return;

    expect(call.url).toBe('http://api.test/pricing/services/wash-fold/pricing');
    expect(call.init?.method).toBe('GET');
    expect(
      (call.init?.headers as Record<string, string>)['authorization'],
    ).toBe('Bearer token_12345678901234567890123456789012');
  });

  it('fails pricing requests before fetch when no CLI session exists', async () => {
    let fetchCalled = false;

    globalThis.fetch = async () => {
      fetchCalled = true;

      return new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
      });
    };

    const clientResult = makeApiPricingClient(
      { PRESSLY_API_URL: 'http://api.test' },
      makeSessionStore(null),
    );

    expect(result.isOk(clientResult)).toBe(true);
    if (result.isErr(clientResult)) return;

    const planResult = await clientResult.value.planChange({
      serviceSlug: 'wash-fold',
      reason: 'Update delivery fee',
      items: [{ code: 'delivery_fee', priceCents: 100 }],
    });

    expect(result.isErr(planResult)).toBe(true);
    if (result.isErr(planResult))
      expect(planResult.error.code).toBe('missing_cli_session');
    expect(fetchCalled).toBe(false);
  });
});
