import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeAppError } from '@pressly/errors';
import { apiFailure, apiSuccess } from '../src/api-response.js';

describe('api response', () => {
  it('creates success envelopes', () => {
    assert.deepEqual(apiSuccess({ status: 'ok' }), {
      ok: true,
      data: {
        status: 'ok',
      },
    });
  });

  it('creates failure envelopes from safe error fields', () => {
    const error = makeAppError({
      kind: 'ValidationError',
      code: 'invalid_request',
      message: 'Internal validation details.',
      safeMessage: 'Invalid request.',
      status: 400,
      traceId: 'trace_123',
    });

    assert.deepEqual(apiFailure(error), {
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'Invalid request.',
        traceId: 'trace_123',
      },
    });
  });
});
