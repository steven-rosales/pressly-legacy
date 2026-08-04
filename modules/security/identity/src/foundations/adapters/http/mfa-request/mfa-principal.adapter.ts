import { authError } from '@pressly/errors/factories';
import type { Response } from 'express';
import { readPrincipal } from '../authentication-request/auth-context.adapter.ts';

export type MfaPrincipal = Readonly<{
  identityId: string;
  sessionId: string;
  label: string;
}>;

export const readMfaPrincipal = (response: Response): MfaPrincipal => {
  const principal = readPrincipal(response);

  if (principal.sessionId !== undefined)
    return {
      identityId: principal.identityId,
      sessionId: principal.sessionId,
      label: principal.email ?? principal.displayName ?? principal.identityId,
    };

  throw authError({
    code: 'missing_mfa_principal',
    message: 'Authenticated MFA principal context is missing.',
    safeMessage: 'Authentication is required.',
  });
};

export const readMfaRequestId = (response: Response): string | undefined =>
  response.locals?.['requestId'] as string | undefined;
