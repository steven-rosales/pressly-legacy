import type { AuthCliOutput } from '../application/command.ts';

export const presentAuthOutput = (output: AuthCliOutput): string => {
  if (output.tag === 'logout') return 'Logged out.';
  if (output.tag === 'mfa-enrollment')
    return [
      'MFA enrollment started',
      '',
      `Secret: ${output.value.secret}`,
      `Authenticator URI: ${output.value.enrollmentUri}`,
      '',
      'Confirm with: pressly-admin auth mfa-confirm --code 123456',
    ].join('\n');
  if (output.tag === 'mfa-recovery-codes')
    return [
      'MFA recovery codes',
      '',
      ...output.value.recoveryCodes,
      '',
      'Store these offline. They will not be shown again.',
    ].join('\n');
  if (output.tag === 'mfa-removed')
    return 'MFA removed. Other sessions revoked.';

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
