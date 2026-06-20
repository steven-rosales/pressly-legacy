import { isAppError, type AppError } from '@pressly/errors';
import { describe, expect, it } from 'vitest';

import type { CliActorEnv } from '../src/resolve-cli-actor.ts';
import { resolveCliActor } from '../src/resolve-cli-actor.ts';

const captureAppError = (action: () => unknown): AppError => {
  try {
    action();
  } catch (error) {
    if (!isAppError(error)) throw error;

    return error;
  }

  throw new Error('expected action to throw an AppError');
};

describe('resolveCliActor', () => {
  it('builds a human actor from required CLI actor env', () => {
    const env: CliActorEnv = {
      PRESSLY_ACTOR_ID: 'actor_1',
      PRESSLY_ACTOR_ROLE: 'operator',
    };

    expect(resolveCliActor(env)).toEqual({
      id: 'actor_1',
      kind: 'human',
      displayName: 'actor_1',
      role: 'operator',
      permissions: ['pricing:read'],
    });
  });

  it('uses PRESSLY_ACTOR_NAME when provided', () => {
    const env: CliActorEnv = {
      PRESSLY_ACTOR_ID: 'actor_1',
      PRESSLY_ACTOR_NAME: 'Backoffice CLI',
      PRESSLY_ACTOR_ROLE: 'admin',
    };

    expect(resolveCliActor(env).displayName).toBe('Backoffice CLI');
  });

  it('marks CI actors as service actors', () => {
    const env: CliActorEnv = {
      CI: 'true',
      PRESSLY_ACTOR_ID: 'ci',
      PRESSLY_ACTOR_ROLE: 'ci',
    };

    expect(resolveCliActor(env)).toMatchObject({
      id: 'ci',
      kind: 'service',
      role: 'ci',
      permissions: [
        'pricing:read',
        'pricing:plan',
        'pricing:publish',
        'pricing:rollback',
      ],
    });
  });

  it.each([
    {
      env: { PRESSLY_ACTOR_ROLE: 'admin' },
      key: 'PRESSLY_ACTOR_ID',
    },
    {
      env: { PRESSLY_ACTOR_ID: 'actor_1', PRESSLY_ACTOR_ROLE: '   ' },
      key: 'PRESSLY_ACTOR_ROLE',
    },
  ] satisfies Array<{ env: CliActorEnv; key: string }>)(
    'throws when $key is missing',
    ({ env, key }) => {
      const error = captureAppError(() => resolveCliActor(env));

      expect(error.kind).toBe('ValidationError');
      expect(error.code).toBe('missing_cli_actor_env');
      expect(error.status).toBe(400);
      expect(error.safeMessage).toBe('CLI actor configuration is missing');
      expect(error.details).toEqual({ key });
    },
  );

  it('throws when PRESSLY_ACTOR_ROLE is not a known role', () => {
    const error = captureAppError(() =>
      resolveCliActor({
        PRESSLY_ACTOR_ID: 'actor_1',
        PRESSLY_ACTOR_ROLE: 'manager',
      }),
    );

    expect(error.kind).toBe('ValidationError');
    expect(error.code).toBe('invalid_cli_actor_role');
    expect(error.status).toBe(400);
    expect(error.safeMessage).toBe('CLI actor role is invalid.');
    expect(error.details).toEqual({ role: 'manager' });
  });
});
