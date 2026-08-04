import { makeAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { writeCliError } from '../../src/shell/errors.ts';
import { makeTestIo } from '../support/io.ts';

const error = makeAppError({
  kind: 'ExternalServiceError',
  code: 'api_request_failed',
  message: 'Internal request failed with token secret-token.',
  safeMessage: 'Could not reach the Pressly API.',
  status: 502,
  traceId: 'request-123',
  details: { token: 'secret-token' },
  publicDetails: { retryAfterSeconds: 30 },
});

describe('CLI error presentation', () => {
  it('writes only the safe message in plain mode', () => {
    const io = makeTestIo();

    writeCliError(io, error, false);

    expect(io.stderr.text()).toBe('Could not reach the Pressly API.\n');
    expect(io.stderr.text()).not.toContain('secret-token');
    expect(io.stderr.text()).not.toContain('Internal request failed');
  });

  it('writes an explicit safe failure envelope in JSON mode', () => {
    const io = makeTestIo();

    writeCliError(io, error, true);

    expect(JSON.parse(io.stderr.text())).toEqual({
      ok: false,
      error: {
        code: 'api_request_failed',
        message: 'Could not reach the Pressly API.',
        traceId: 'request-123',
        details: { retryAfterSeconds: 30 },
      },
    });
    expect(io.stderr.text()).not.toContain('secret-token');
    expect(io.stderr.text()).not.toContain('Internal request failed');
    expect(io.stderr.text()).not.toContain('ExternalServiceError');
  });
});
