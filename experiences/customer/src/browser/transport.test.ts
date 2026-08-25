import { unexpectedError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import { describe, expect, it, vi } from 'vitest';
import type { BrowserResponseCodec } from './transport.ts';
import { makeCustomerBrowserRequestTransport } from './transport.ts';

const codec = <Output>(
  decode: BrowserResponseCodec<Output>['decode'],
): BrowserResponseCodec<Output> => ({ decode });

describe('Customer browser request transport', () => {
  it('preserves Next request policy and decodes serialized wire values', async () => {
    const serialized = { updatedAt: '2026-08-22T20:00:00.000Z' };
    const send = vi.fn(async (request) =>
      result.ok(request.response.parse(serialized)),
    );
    const request = makeCustomerBrowserRequestTransport({
      request: { send },
      next: { revalidate: 3600, tags: ['pricing'] },
    });

    const response = await request(
      { method: 'GET', path: '/pricing/catalog' },
      codec((value) => ({ kind: 'valid', value: value as typeof serialized })),
    );

    expect(response).toEqual(serialized);
    expect(response.updatedAt).toBe(serialized.updatedAt);
    expect(send).toHaveBeenCalledWith({
      method: 'GET',
      path: '/pricing/catalog',
      response: expect.any(Object),
      next: { revalidate: 3600, tags: ['pricing'] },
    });
  });

  it('preserves the app error returned by the request client', async () => {
    const fault = unexpectedError({
      code: 'customer_browser_request_fault_fixture',
      message: 'Customer browser request fault fixture.',
    });
    const request = makeCustomerBrowserRequestTransport({
      request: { send: vi.fn(async () => result.err(fault)) },
    });

    await expect(
      request(
        { method: 'GET', path: '/pricing/catalog' },
        codec((value) => ({ kind: 'valid', value })),
      ),
    ).rejects.toBe(fault);
  });
});
