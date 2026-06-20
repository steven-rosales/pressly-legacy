import { result } from '@pressly/kernel';
import { makeAppError } from '@pressly/errors';
import { z } from 'zod';
import { makeTestWebCore } from '@/common/testing/make-test-web-core';
import type { RequestClient } from '../requests/request-client';

describe('core.query', () => {
  it('returns result.ok(value) on success', async () => {
    const core = makeTestWebCore();

    const actual = await core.query.run({
      meta: { action: 'loading_pricing', rail: 'query', criticality: 'low' },
      work: async () => ({ price: 10 }),
    });

    expect(actual).toEqual({ tag: 'ok', value: { price: 10 } });
  });

  it('return result.err(AppError) on failure', async () => {
    const core = makeTestWebCore();

    const appError = makeAppError({
      kind: 'UnexpectedError',
      code: 'invalid_pricing_request',
      message: 'Pricing request failed.',
      safeMessage: 'Could not load pricing',
      status: 400,
    });

    const actual = await core.query.run({
      meta: { action: 'load_pricing', rail: 'query', criticality: 'low' },
      work: async () => {
        throw appError;
      },
    });

    expect(result.isErr(actual)).toBe(true);

    if (result.isErr(actual))
      expect(actual.error).toMatchObject({
        tag: 'AppError',
        code: 'invalid_pricing_request',
        safeMessage: 'Could not load pricing',
        kind: 'UnexpectedError',
      });

    expect(core.calls.errors).toHaveLength(0);
  });

  it('reports medium/high query failures', async () => {
    const core = makeTestWebCore();

    await core.query.run({
      meta: { action: 'local_account', rail: 'query', criticality: 'high' },
      work: async () => {
        throw makeAppError({
          kind: 'ExternalServiceError',
          code: 'api_unavailable',
          message: 'API unavailable.',
          safeMessage: 'Could not load account.',
          status: 503,
        });
      },
    });

    expect(core.calls.errors).toHaveLength(1);
  });

  it('fetches through the request port without nesting Result inside Result', async () => {
    const request: RequestClient = {
      send: async <A>() => result.ok({ price: 10 } as A),
    };
    const core = makeTestWebCore({}, { request });

    const actual = await core.query.fetch({
      meta: { action: 'load_pricing', rail: 'query', criticality: 'low' },
      request: {
        method: 'GET',
        path: '/pricing',
        response: z.object({ price: z.number() }),
      },
    });

    expect(actual).toEqual({ tag: 'ok', value: { price: 10 } });
  });

  it('returns request AppError failures directly', async () => {
    const appError = makeAppError({
      kind: 'ExternalServiceError',
      code: 'api_unavailable',
      message: 'API unavailable.',
      safeMessage: 'Could not load account.',
      status: 503,
    });
    const request: RequestClient = {
      send: async () => result.err(appError),
    };
    const core = makeTestWebCore({}, { request });

    const actual = await core.query.fetch({
      meta: { action: 'local_account', rail: 'query', criticality: 'high' },
      request: {
        method: 'GET',
        path: '/account',
        response: z.object({ id: z.string() }),
      },
    });

    expect(actual).toEqual({ tag: 'err', error: appError });
    expect(core.calls.errors).toHaveLength(1);
  });
});
