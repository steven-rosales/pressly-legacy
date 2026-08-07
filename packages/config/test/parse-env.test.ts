import { describe, expect, it } from 'vitest';
import { isAppError } from '@pressly/errors/app-error';
import { z } from 'zod';
import { parseEnv } from '../src/parse-env.js';

describe('parseEnv', () => {
  it('returns frozen parsed env', () => {
    const env = parseEnv(z.object({ PORT: z.coerce.number() }), {
      PORT: '4000',
    });

    expect(env.PORT).toBe(4000);
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('throws ConfigError for invalid env', () => {
    let thrown: unknown;

    try {
      parseEnv(z.object({ API_URL: z.url() }), { API_URL: 'not-a-url' });
    } catch (error) {
      thrown = error;
    }

    expect(isAppError(thrown)).toBe(true);
    if (!isAppError(thrown)) return;
    expect(thrown.kind).toBe('ConfigError');
    expect(thrown.code).toBe('invalid_environment');
    expect(thrown.status).toBe(500);
  });
});
