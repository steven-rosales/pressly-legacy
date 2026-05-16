import { validationError } from '@pressly/errors';
import { makeActor, type Actor } from './actor.ts';
import { isRole } from './permission.ts';

export type CliActorEnv = NodeJS.ProcessEnv;

const readRequired = (env: CliActorEnv, key: string): string => {
  const value = env[key];

  if (value === undefined || value.trim() === '')
    throw validationError({
      code: 'missing_cli_actor_env',
      message: `${key} is required for CLI auth.`,
      safeMessage: 'CLI actor configuration is missing',
      details: { key },
    });

  return value;
};

export const resolveCliActor = (env: CliActorEnv): Actor => {
  const id = readRequired(env, 'PRESSLY_ACTOR_ID');
  const displayName = env['PRESSLY_ACTOR_NAME'] ?? id;
  const roleValue = readRequired(env, 'PRESSLY_ACTOR_ROLE');

  if (!isRole(roleValue))
    throw validationError({
      code: 'invalid_cli_actor_role',
      message: `Invalid PRESSLY_ACTOR_ROLE: ${roleValue}.`,
      safeMessage: 'CLI actor role is invalid.',
      details: { role: roleValue },
    });

  const kind = env['CI'] === 'true' ? 'service' : 'user';

  return makeActor({ id, kind, displayName, role: roleValue });
};
