import type { AuthCliOutput } from '../application/command.ts';

export const presentAuthOutput = (output: AuthCliOutput): string => {
  if (output.tag === 'logout') return 'Logged out.';

  const principal = output.value.principal;

  return [
    `Signed in as ${principal.displayName}.`,
    `Identity: ${principal.identityId}`,
    `Roles: ${principal.roles.join(', ')}`,
    `Expires: ${output.value.expiresAt}`,
  ].join('\n');
};

export const serializeAuthOutput = (output: AuthCliOutput): unknown =>
  output.value;
