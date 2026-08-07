import type { Request, RequestHandler, Response } from 'express';

import { sessionAgeMinutes } from '@pressly/auth/authentication';
import {
  authorize,
  isDenied,
  type Action,
  type AuthEnvironment,
  type AuthResource,
  type PolicyRule,
} from '@pressly/auth/authorization';
import { permissionError } from '@pressly/errors/factories';
import type { Clock } from '@pressly/time';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import { readAuthContext } from './auth-context.adapter.ts';

export type AuthorizeMiddlewareInput<R extends AuthResource = AuthResource> =
  Readonly<{
    action: Action;
    policies: readonly PolicyRule<R>[];
    readResource: (req: Request, res: Response) => R | Promise<R>;
  }>;

export type AuthorizeMiddlewareFactory = <R extends AuthResource>(
  input: AuthorizeMiddlewareInput<R>,
) => RequestHandler;

const environmentFromRequest = (
  req: Request,
  principal: ReturnType<typeof readAuthContext>['principal'],
  now: Date,
): AuthEnvironment => {
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
  (
    deps: Readonly<{
      clock: Clock;
      securityEvents?: SecurityEventSink;
    }>,
  ): AuthorizeMiddlewareFactory =>
  <R extends AuthResource>(input: AuthorizeMiddlewareInput<R>) =>
  async (req, res, next) => {
    const auth = readAuthContext(res);
    const resource = await input.readResource(req, res);
    const environment = environmentFromRequest(
      req,
      auth.principal,
      deps.clock.now(),
    );

    const decision = authorize({
      principal: auth.principal,
      principalAttributes: auth.principalAttributes,
      action: input.action,
      resource,
      environment,
      policies: input.policies,
    });

    if (isDenied(decision)) {
      (deps.securityEvents ?? nullSecurityEventSink).emit({
        name: 'authorization.denied',
        occurredAt: environment.now.toISOString(),
        outcome: 'denied',
        ...((res.locals['requestId'] as string | undefined) === undefined
          ? {}
          : { requestId: res.locals['requestId'] as string }),
        principalId: auth.principal.identityId,
        ...(auth.principal.sessionId === undefined
          ? {}
          : { sessionId: auth.principal.sessionId }),
        action: input.action,
        resourceType: resource.kind,
        ...(resource.id === undefined ? {} : { resourceId: resource.id }),
        reason: decision.reason,
      });

      throw permissionError({
        code: decision.reason,
        message: decision.safeMessage,
        safeMessage: decision.safeMessage,
        details: {
          ...(decision.details ?? ({} as Record<string, unknown>)),
          action: input.action,
          resource: resource.kind,
          scope: resource.scope,
          policyId: decision.policyId,
        },
      });
    }

    res.locals['authorization'] = {
      action: input.action,
      resource,
      decision,
    };

    next();
  };
