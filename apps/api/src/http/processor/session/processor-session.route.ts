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
import { processorUnauthorized } from './processor-session.error.ts';
import {
  processorBrowserSession,
  processorRequestId,
  processorRequestMetadata,
} from './processor-session.mapper.ts';
import type { LoadProcessorCookieSession } from './processor-session.middleware.ts';
import {
  isResultError,
  type ProcessorAuthApplication,
  type ProcessorSessionOptions,
} from './processor-session.port.ts';

const sendFailure = (response: Response, error: AppError): void => {
  response.status(error.status).json(apiFailure(error));
};

export const makeProcessorSessionRoutes = (input: {
  application: ProcessorAuthApplication;
  loadCookieSession: LoadProcessorCookieSession;
  names: ProcessorCookieNames;
  options: ProcessorSessionOptions;
}): Router => {
  const routes = Router();
  routes.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

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
      const loaded = await input.application.loadSession({
        bearerToken: authenticated.value.accessToken,
      });
      if (isResultError(loaded)) {
        sendFailure(response, loaded.error);
        return;
      }
      setProcessorCookie(
        response,
        input.names.session,
        authenticated.value.accessToken,
        authenticated.value.expiresAt,
        input.options,
      );
      response
        .status(200)
        .json(
          apiSuccess(
            processorBrowserSession(
              loaded.value,
              authenticated.value.accessToken,
              input.options,
            ),
          ),
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
      const loaded = await input.application.loadSession({
        bearerToken: completed.value.accessToken,
      });
      if (isResultError(loaded)) {
        sendFailure(response, loaded.error);
        return;
      }
      setProcessorCookie(
        response,
        input.names.session,
        completed.value.accessToken,
        completed.value.expiresAt,
        input.options,
      );
      response
        .status(200)
        .json(
          apiSuccess(
            processorBrowserSession(
              loaded.value,
              completed.value.accessToken,
              input.options,
            ),
          ),
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
