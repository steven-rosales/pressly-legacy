import type { Request, RequestHandler, Response } from 'express';

import {
  sessionAgeMinutes,
  type Principal,
} from '@pressly/auth/authentication';
import {
  authorize,
  isDenied,
  type Action,
  type AuthEnvironment,
  type AuthResource,
  type PolicyRule,
  type PrincipalAttributes,
} from '@pressly/auth/authorization';
import { catchAsync } from '@pressly/http/express';
import { makeAppError } from '@pressly/errors';

type AuthLocals = Readonly<{
  principal: Principal;
  principalAttributes: PrincipalAttributes;
}>;

export type AuthorizeMiddlewareInput<R extends AuthResource = AuthResource> =
  Readonly<{
    action: Action;
    policies: readonly PolicyRule<R>[];
    readResource: (req: Request, res: Response) => R;
  }>;

export type AuthorizeMiddlewareFactory = <R extends AuthResource>(
  input: AuthorizeMiddlewareInput<R>,
) => RequestHandler;

const readAuthLocals = (res: Response): AuthLocals => {
  const auth = res.locals['auth'] as AuthLocals | undefined;

  if (auth !== undefined) return auth;

  throw makeAppError({
    kind: 'PermissionError',
    code: 'missing_auth_context',
    message: 'Auth middleware did not run before authorization.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });
};

const environmentFromRequest = (
  req: Request,
  principal: Principal,
): AuthEnvironment => {
  const now = new Date();
  const ipAddress = req.ip;
  const userAgent = req.header('user-agent');

  return {
    now,
    ...(ipAddress === undefined ? {} : { ipAddress }),
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(principal.sessionIssuedAt === undefined
      ? {}
      : {
          sessionAgeMinutes: sessionAgeMinutes(
            { issuedAt: principal.sessionIssuedAt },
            now,
          ),
        }),
  };
};

export const makeAuthorizeMiddleware =
  (): AuthorizeMiddlewareFactory =>
  <R extends AuthResource>(input: AuthorizeMiddlewareInput<R>) =>
    catchAsync(async (req, res, next) => {
      const auth = readAuthLocals(res);
      const resource = input.readResource(req, res);
      const environment = environmentFromRequest(req, auth.principal);

      const decision = authorize({
        principal: auth.principal,
        principalAttributes: auth.principalAttributes,
        action: input.action,
        resource,
        environment,
        policies: input.policies,
      });

      if (isDenied(decision))
        throw makeAppError({
          kind: 'PermissionError',
          code: decision.reason,
          message: decision.safeMessage,
          safeMessage: decision.safeMessage,
          status: 403,
          details: {
            ...(decision.details ?? ({} as Record<string, unknown>)),
            action: input.action,
            resource: resource.kind,
            scope: resource.scope,
            policyId: decision.policyId,
          },
        });

      res.locals['authorization'] = {
        action: input.action,
        resource,
        decision,
      };

      next();
    });
