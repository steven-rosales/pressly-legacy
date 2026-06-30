import type { Principal } from '@pressly/auth/authentication';
import { makeAppError } from '@pressly/errors';
import type { Response } from 'express';

type AuthLocals = Readonly<{ principal: Principal }>;

export const readAuthLocals = (res: Response): AuthLocals => {
  const auth = res.locals['auth'] as AuthLocals | undefined;
  if (auth?.principal !== undefined) return auth;

  throw makeAppError({
    kind: 'PermissionError',
    code: 'missing_auth_principal',
    message: 'Authenticated principal is missing from request locals.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });
};
