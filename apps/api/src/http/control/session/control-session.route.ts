import {
  loginRequestSchema,
  processorCompleteMfaChallengeRequestSchema,
  type ControlAuthenticatedSession,
} from '@pressly/contracts/auth';
import { apiSuccess } from '@pressly/http';
import { defineValidatedController } from '@pressly/http/express';
import { Router, type Response } from 'express';
import {
  clearControlCookie,
  readControlCookie,
  setControlCookie,
  type ControlCookieNames,
} from './control-cookie.adapter.ts';
import {
  deriveControlCsrfToken,
  requireControlOrigin,
} from './control-csrf.adapter.ts';
import {
  controlForbidden,
  controlUnauthorized,
} from './control-session.error.ts';
import {
  controlRequestId,
  controlRequestMetadata,
} from './control-request-metadata.adapter.ts';
import { controlBrowserSession } from './control-session.contract.mapper.ts';
import type { LoadControlCookieSession } from './control-session.middleware.ts';
import {
  isControlResultError,
  type ControlAuthApplication,
  type ControlSessionOptions,
  type ResolveControlAccess,
} from './control-session.port.ts';

export const establishControlBrowserSession = async (input: {
  response: Response;
  application: ControlAuthApplication;
  resolveAccess: ResolveControlAccess;
  names: ControlCookieNames;
  options: ControlSessionOptions;
  accessToken: string;
  expiresAt: Date;
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
    deriveControlCsrfToken(input.accessToken, input.options.csrfSecret),
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
  const loginController = defineValidatedController({
    request: { body: loginRequestSchema },
    handle: async ({ body }, { request, response }) => {
      const authenticated = await input.application.login({
        ...body,
        ...controlRequestMetadata(request, response),
      });
      if (isControlResultError(authenticated)) throw authenticated.error;

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
    },
  });
  const challengeController = defineValidatedController({
    request: { body: processorCompleteMfaChallengeRequestSchema },
    handle: async ({ body }, { request, response }) => {
      const challengeToken = readControlCookie(
        request.header('cookie'),
        input.names.mfa,
      );
      if (challengeToken === null)
        throw controlUnauthorized({
          code: 'control_mfa_challenge_missing',
          message: 'Control MFA challenge cookie is missing.',
        });

      const completed = await input.application.completeMfaChallenge({
        ...body,
        challengeToken,
        ...(controlRequestId(response) === undefined
          ? {}
          : { requestId: controlRequestId(response)! }),
      });
      if (isControlResultError(completed)) throw completed.error;

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
    },
  });

  routes.post(
    '/login',
    requireOrigin,
    loginController.validate,
    loginController.handle,
  );

  routes.post(
    '/mfa/challenge',
    requireOrigin,
    challengeController.validate,
    challengeController.handle,
  );

  routes.get('/session', async (request, response) => {
    const session = await input.loadCookieSession(request, response);

    response
      .status(200)
      .json(
        apiSuccess(
          controlBrowserSession(
            session.loaded,
            session.access,
            deriveControlCsrfToken(
              session.sessionToken,
              input.options.csrfSecret,
            ),
          ),
        ),
      );
  });

  routes.post('/logout', async (request, response) => {
    const session = await input.loadCookieSession(request, response);
    const revoked = await input.application.revokeSession({
      bearerToken: session.sessionToken,
      ...(controlRequestId(response) === undefined
        ? {}
        : { requestId: controlRequestId(response)! }),
    });

    clearControlCookie(response, input.names.session, input.options);
    clearControlCookie(response, input.names.mfa, input.options);

    response.status(200).json(apiSuccess(revoked));
  });

  return routes;
};
