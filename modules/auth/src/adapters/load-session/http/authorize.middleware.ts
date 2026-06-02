import type { RequestHandler } from 'express';
import {
  allow,
  authorize,
  freshSession,
  sessionAgeMinutes,
  type AuthContext,
  type Actor,
  type Permission,
  type Principal,
  type Role,
} from '@pressly/auth';
import { catchAsync } from '@pressly/http/express';
import { makeAppError } from '@pressly/errors';

type AuthLocals = Readonly<{
  principal: Principal;
  actor: Actor;
}>;

export type AuthorizeMiddlewareInput = Readonly<{
  action: Permission;
  roles: readonly Role[];
  freshSessionMaxAgeMinutes?: number;
}>;

export type AuthorizeMiddlewareFactory = (
  input: AuthorizeMiddlewareInput,
) => RequestHandler;

export const makeAuthorizeMiddleware =
  (): AuthorizeMiddlewareFactory => (input) =>
    catchAsync(async (_req, res, next) => {
      const auth = res.locals['auth'] as AuthLocals | undefined;

      if (auth === undefined)
        throw makeAppError({
          kind: 'PermissionError',
          code: 'missing_auth_context',
          message: 'Auth middleware did not run before authorization.',
          safeMessage: 'Authentication is required.',
          status: 401,
        });

      const conditions =
        input.freshSessionMaxAgeMinutes === undefined
          ? []
          : [freshSession({ maxAgeMinutes: input.freshSessionMaxAgeMinutes })];

      const policies = [
        allow(input.action)
          .to(...input.roles)
          .require(input.action)
          .when(...conditions),
      ];

      const context: AuthContext =
        auth.principal.sessionIssuedAt === undefined
          ? {}
          : {
              sessionAgeMinutes: sessionAgeMinutes(
                { issuedAt: auth.principal.sessionIssuedAt },
                new Date(),
              ),
            };

      const decision = authorize({
        actor: auth.actor,
        action: input.action,
        context,
        policies,
      });

      if (!decision.ok)
        throw makeAppError({
          kind: 'PermissionError',
          code: decision.reason,
          message: decision.safeMessage,
          safeMessage: decision.safeMessage,
          status: 403,
          details: decision.details,
        });

      next();
    });
