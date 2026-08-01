import {
  loginRequestSchema,
  processorCompleteMfaChallengeRequestSchema,
  type ProcessorCompleteMfaChallengeRequest,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import { Router, type Response } from 'express';
import {
  clearProcessorCookie,
  readProcessorCookie,
  setProcessorCookie,
  type ProcessorCookieNames,
} from './processor-cookie.adapter.ts';
import { requireProcessorOrigin } from './processor-csrf.policy.ts';
import {
  processorForbidden,
  processorUnauthorized,
} from './processor-session.error.ts';
import {
  processorBrowserSession,
  processorRequestId,
  processorRequestMetadata,
} from './processor-session.mapper.ts';
import type { LoadProcessorCookieSession } from './processor-session.middleware.ts';
import {
  isResultError,
  type ProcessorAuthApplication,
  type ResolveProcessorAccess,
  type ProcessorSessionOptions,
} from './processor-session.port.ts';

const sendFailure = (response: Response, error: AppError): void => {
  response.status(error.status).json(apiFailure(error));
};

export const makeProcessorSessionRoutes = (input: {
  application: ProcessorAuthApplication;
  loadCookieSession: LoadProcessorCookieSession;
  resolveAccess: ResolveProcessorAccess;
  names: ProcessorCookieNames;
  options: ProcessorSessionOptions;
}): Router => {
  const routes = Router();
  routes.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Vary', 'Origin');
    next();
  });

  const establishBrowserSession = async (
    response: Response,
    accessToken: string,
    expiresAt: string,
  ): Promise<void> => {
    const loaded = await input.application.loadSession({
      bearerToken: accessToken,
    });
    if (isResultError(loaded)) {
      sendFailure(response, loaded.error);
      return;
    }
    const access = await input.resolveAccess(loaded.value);
    if (access === null) {
      await input.application.revokeSession({
        bearerToken: accessToken,
        ...(processorRequestId(response) === undefined
          ? {}
          : { requestId: processorRequestId(response)! }),
      });
      clearProcessorCookie(response, input.names.session, input.options);
      throw processorForbidden({
        code: 'processor_access_unavailable',
        message:
          'Identity has no active production capability at an active location.',
        safeMessage: 'Your account does not have access to Pressly Processor.',
      });
    }

    setProcessorCookie(
      response,
      input.names.session,
      accessToken,
      expiresAt,
      input.options,
    );
    response
      .status(200)
      .json(
        apiSuccess(
          processorBrowserSession(
            loaded.value,
            access,
            accessToken,
            input.options,
          ),
        ),
      );
  };

  routes.post(
    '/login',
    (request, _response, next) => {
      try {
        requireProcessorOrigin(request, input.options);
        next();
      } catch (error) {
        next(error);
      }
    },
    validateRequest({ body: loginRequestSchema }),
    catchAsync(async (request, response) => {
      const authenticated = await input.application.login({
        ...(request.body as { email: string; password: string }),
        ...processorRequestMetadata(request, response),
      });
      if (isResultError(authenticated)) {
        sendFailure(response, authenticated.error);
        return;
      }

      if ('challengeToken' in authenticated.value) {
        clearProcessorCookie(response, input.names.session, input.options);
        setProcessorCookie(
          response,
          input.names.mfa,
          authenticated.value.challengeToken,
          authenticated.value.expiresAt,
          input.options,
        );
        response.status(200).json(
          apiSuccess({
            status: 'mfa_required' as const,
            expiresAt: authenticated.value.expiresAt,
          }),
        );
        return;
      }

      clearProcessorCookie(response, input.names.mfa, input.options);
      await establishBrowserSession(
        response,
        authenticated.value.accessToken,
        authenticated.value.expiresAt,
      );
    }),
  );

  routes.post(
    '/mfa/challenge',
    (request, _response, next) => {
      try {
        requireProcessorOrigin(request, input.options);
        next();
      } catch (error) {
        next(error);
      }
    },
    validateRequest({ body: processorCompleteMfaChallengeRequestSchema }),
    catchAsync(async (request, response) => {
      const challengeToken = readProcessorCookie(
        request.header('cookie'),
        input.names.mfa,
      );
      if (challengeToken === null)
        throw processorUnauthorized({
          code: 'processor_mfa_challenge_missing',
          message: 'Processor MFA challenge cookie is missing.',
        });

      const body = request.body as ProcessorCompleteMfaChallengeRequest;
      const completed = await input.application.completeMfaChallenge({
        ...body,
        challengeToken,
        ...(processorRequestId(response) === undefined
          ? {}
          : { requestId: processorRequestId(response)! }),
      });
      if (isResultError(completed)) {
        sendFailure(response, completed.error);
        return;
      }

      clearProcessorCookie(response, input.names.mfa, input.options);
      await establishBrowserSession(
        response,
        completed.value.accessToken,
        completed.value.expiresAt,
      );
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
            processorBrowserSession(
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
        ...(processorRequestId(response) === undefined
          ? {}
          : { requestId: processorRequestId(response)! }),
      });
      if (isResultError(revoked)) {
        sendFailure(response, revoked.error);
        return;
      }

      clearProcessorCookie(response, input.names.session, input.options);
      clearProcessorCookie(response, input.names.mfa, input.options);
      response.status(200).json(apiSuccess(revoked.value));
    }),
  );

  return routes;
};
