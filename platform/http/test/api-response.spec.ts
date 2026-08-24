import { describe, expect, it } from 'vitest';
import { makeAppError } from '@pressly/errors/app-error';
import { apiFailure, apiSuccess } from '../src/api-response.js';

describe('api response', () => {
  it('creates success envelopes', () => {
    expect(apiSuccess({ status: 'ok' })).toEqual({
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
      details: { databaseColumn: 'private_value' },
      publicDetails: { field: 'email' },
    });

    expect(apiFailure(error)).toEqual({
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'Invalid request.',
        traceId: 'trace_123',
        details: { field: 'email' },
      },
    });

    expect(JSON.stringify(apiFailure(error))).not.toContain('databaseColumn');
  });
});
