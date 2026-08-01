import {
  loginRequestSchema,
  processorCompleteMfaChallengeRequestSchema,
  type ControlAuthenticatedSession,
  type ProcessorCompleteMfaChallengeRequest,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import { Router, type Response } from 'express';
import {
  clearControlCookie,
  readControlCookie,
  setControlCookie,
  type ControlCookieNames,
} from './control-cookie.adapter.ts';
import { requireControlOrigin } from './control-csrf.policy.ts';
import {
  controlForbidden,
  controlUnauthorized,
} from './control-session.error.ts';
import {
  controlBrowserSession,
  controlRequestId,
  controlRequestMetadata,
} from './control-session.mapper.ts';
import type { LoadControlCookieSession } from './control-session.middleware.ts';
import {
  isControlResultError,
  type ControlAuthApplication,
  type ControlSessionOptions,
  type ResolveControlAccess,
} from './control-session.port.ts';

const sendFailure = (response: Response, error: AppError): void => {
  response.status(error.status).json(apiFailure(error));
};

export const establishControlBrowserSession = async (input: {
  response: Response;
  application: ControlAuthApplication;
  resolveAccess: ResolveControlAccess;
  names: ControlCookieNames;
  options: ControlSessionOptions;
  accessToken: string;
  expiresAt: string;
}): Promise<ControlAuthenticatedSession> => {
  const loaded = await input.application.loadSession({
    bearerToken: input.accessToken,
  });
  if (isControlResultError(loaded)) throw loaded.error;

  const access = await input.resolveAccess(loaded.value);
  if (access === null) {
    await input.application.revokeSession({
      bearerToken: input.accessToken,
      ...(controlRequestId(input.response) === undefined
        ? {}
        : { requestId: controlRequestId(input.response)! }),
    });
    clearControlCookie(input.response, input.names.session, input.options);
    throw controlForbidden({
      code: 'control_access_unavailable',
      message:
        'Identity has no unambiguous active owner or manager Control access.',
      safeMessage: 'Your account does not have access to Pressly Control.',
    });
  }

  setControlCookie(
    input.response,
    input.names.session,
    input.accessToken,
    input.expiresAt,
    input.options,
  );
  return controlBrowserSession(
    loaded.value,
    access,
    input.accessToken,
    input.options,
  );
};

export const makeControlSessionRoutes = (input: {
  application: ControlAuthApplication;
  loadCookieSession: LoadControlCookieSession;
  resolveAccess: ResolveControlAccess;
  names: ControlCookieNames;
  options: ControlSessionOptions;
}): Router => {
  const routes = Router();
  routes.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Vary', 'Origin');
    next();
  });

  const requireOrigin = (
    request: Parameters<typeof requireControlOrigin>[0],
    _response: Response,
    next: (error?: unknown) => void,
  ) => {
    try {
      requireControlOrigin(request, input.options);
      next();
    } catch (error) {
      next(error);
    }
  };

  routes.post(
    '/login',
    requireOrigin,
    validateRequest({ body: loginRequestSchema }),
    catchAsync(async (request, response) => {
      const authenticated = await input.application.login({
        ...(request.body as { email: string; password: string }),
        ...controlRequestMetadata(request, response),
      });
      if (isControlResultError(authenticated)) {
        sendFailure(response, authenticated.error);
        return;
      }

      if ('challengeToken' in authenticated.value) {
        clearControlCookie(response, input.names.session, input.options);
        setControlCookie(
          response,
          input.names.mfa,
          authenticated.value.challengeToken,
          authenticated.value.expiresAt,
          input.options,
        );
        response.status(200).json(
          apiSuccess({
            status: 'mfa_required' as const,
            methods: ['totp', 'recovery'] as const,
          }),
        );
        return;
      }

      clearControlCookie(response, input.names.mfa, input.options);
      const session = await establishControlBrowserSession({
        response,
        application: input.application,
        resolveAccess: input.resolveAccess,
        names: input.names,
        options: input.options,
        accessToken: authenticated.value.accessToken,
        expiresAt: authenticated.value.expiresAt,
      });
      response.status(200).json(apiSuccess(session));
    }),
  );

  routes.post(
    '/mfa/challenge',
    requireOrigin,
    validateRequest({ body: processorCompleteMfaChallengeRequestSchema }),
    catchAsync(async (request, response) => {
      const challengeToken = readControlCookie(
        request.header('cookie'),
        input.names.mfa,
      );
      if (challengeToken === null)
        throw controlUnauthorized({
          code: 'control_mfa_challenge_missing',
          message: 'Control MFA challenge cookie is missing.',
        });

      const body = request.body as ProcessorCompleteMfaChallengeRequest;
      const completed = await input.application.completeMfaChallenge({
        ...body,
        challengeToken,
        ...(controlRequestId(response) === undefined
          ? {}
          : { requestId: controlRequestId(response)! }),
      });
      if (isControlResultError(completed)) {
        sendFailure(response, completed.error);
        return;
      }

      clearControlCookie(response, input.names.mfa, input.options);
      const session = await establishControlBrowserSession({
        response,
        application: input.application,
        resolveAccess: input.resolveAccess,
        names: input.names,
        options: input.options,
        accessToken: completed.value.accessToken,
        expiresAt: completed.value.expiresAt,
      });
      response.status(200).json(apiSuccess(session));
    }),
  );

  routes.get(
    '/session',
    catchAsync(async (request, response) => {
      const session = await input.loadCookieSession(request, response);
      response
        .status(200)
        .json(
          apiSuccess(
            controlBrowserSession(
              session.loaded,
              session.access,
              session.sessionToken,
              input.options,
            ),
          ),
        );
    }),
  );

  routes.post(
    '/logout',
    catchAsync(async (request, response) => {
      const session = await input.loadCookieSession(request, response);
      const revoked = await input.application.revokeSession({
        bearerToken: session.sessionToken,
        ...(controlRequestId(response) === undefined
          ? {}
          : { requestId: controlRequestId(response)! }),
      });
      if (isControlResultError(revoked)) {
        sendFailure(response, revoked.error);
        return;
      }

      clearControlCookie(response, input.names.session, input.options);
      clearControlCookie(response, input.names.mfa, input.options);
      response.status(200).json(apiSuccess(revoked.value));
    }),
  );

  return routes;
};
