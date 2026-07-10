import type { Principal } from '@pressly/auth/authentication';
import type { PrincipalAttributes } from '@pressly/auth/authorization';
import { makeAppError } from '@pressly/errors';
import type { Response } from 'express';

export type AuthHttpContext = Readonly<{
  principal: Principal;
  principalAttributes: PrincipalAttributes;
}>;

export const readAuthContext = (res: Response): AuthHttpContext => {
  const auth = res.locals['auth'] as AuthHttpContext | undefined;

  if (auth !== undefined) return auth;

  throw makeAppError({
    kind: 'PermissionError',
    code: 'missing_auth_context',
    message: 'Auth middleware did not run before authorization.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });
};

export const readPrincipal = (res: Response): Principal => {
  const auth = res.locals['auth'] as Partial<AuthHttpContext> | undefined;

  if (auth?.principal !== undefined) return auth.principal;

  throw makeAppError({
    kind: 'PermissionError',
    code: 'missing_auth_principal',
    message: 'Authenticated principal is missing from request locals.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });
};
