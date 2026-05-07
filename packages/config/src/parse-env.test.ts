import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAppError } from '@pressly/errors';
import { z } from 'zod';
import { parseEnv } from './parse-env.js';

describe('parseEnv', () => {
  it('returns frozen parsed env', () => {
    const env = parseEnv(z.object({ PORT: z.coerce.number() }), {
      PORT: '4000',
    });

    assert.equal(env.PORT, 4000);
    assert.equal(Object.isFrozen(env), true);
  });

  it('throws ConfigError for invalid env', () => {
    assert.throws(
      () => parseEnv(z.object({ API_URL: z.url() }), { API_URL: 'not-a-url' }),
      (error) =>
        isAppError(error) &&
        error.kind === 'ConfigError' &&
        error.code === 'invalid_environment' &&
        error.status === 500,
    );
  });
});
