import { makeAppError } from '@pressly/errors';
import { makeTestWebCore } from '@/common/testing/make-test-web-core';
import { makeQueryRunner } from './query';

describe('makeQueryRunner', () => {
  it('returns ok(value) on success', async () => {
    const core = makeTestWebCore();
    const runQuery = makeQueryRunner(core);

    const result = await runQuery(
      { action: 'loading_pricing', rail: 'query', criticality: 'low' },
      async () => ({ price: 10 }),
    );

    expect(result).toEqual({ ok: true, value: { price: 10 } });
  });

  it('return err(AppError) on failure', async () => {
    const core = makeTestWebCore();
    const runQuery = makeQueryRunner(core);

    const appError = makeAppError({
      kind: 'UnexpectedError',
      code: 'invalid_pricing_request',
      message: 'Pricing request failed.',
      safeMessage: 'Could not load pricing',
      status: 400,
    });

    const result = await runQuery(
      { action: 'load_pricing', rail: 'query', criticality: 'low' },
      async () => {
        throw appError;
      },
    );

    expect(result.ok).toBe(false);

    if (!result.ok)
      expect(result.error).toMatchObject({
        tag: 'AppError',
        code: 'invalid_pricing_request',
        safeMessage: 'Could not load pricing',
        kind: 'UnexpectedError',
      });

    expect(core.calls.errors).toHaveLength(0);
  });

  it('reports medium/high query failures', async () => {
    const core = makeTestWebCore();
    const runQuery = makeQueryRunner(core);

    await runQuery(
      { action: 'local_account', rail: 'query', criticality: 'high' },
      async () => {
        throw makeAppError({
          kind: 'ExternalServiceError',
          code: 'api_unavailable',
          message: 'API unavailable.',
          safeMessage: 'Could not load account.',
          status: 503,
        });
      },
    );

    expect(core.calls.errors).toHaveLength(1);
  });
});
