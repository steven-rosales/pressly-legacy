import {
  loginRequestSchema,
  processorCompleteMfaChallengeRequestSchema,
} from '@pressly/contracts/auth';
import { apiSuccess } from '@pressly/http';
import { defineValidatedController } from '@pressly/http/express';
import type { ResolveProcessorAccess } from '@pressly/processor-experience';
import { Router, type Response } from 'express';
import {
  clearProcessorCookie,
  readProcessorCookie,
  setProcessorCookie,
  type ProcessorCookieNames,
} from './processor-cookie.adapter.ts';
import { requireProcessorOrigin } from './processor-csrf.adapter.ts';
import {
  processorForbidden,
  processorUnauthorized,
} from './processor-session.error.ts';
import {
  processorBrowserSession,
  processorRequestId,
  processorRequestMetadata,
} from './processor-session.contract.mapper.ts';
import type { LoadProcessorCookieSession } from './processor-session.middleware.ts';
import {
  isResultError,
  type ProcessorAuthApplication,
  type ProcessorSessionOptions,
} from './processor-session.port.ts';

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
    expiresAt: Date,
  ): Promise<void> => {
    const loaded = await input.application.loadSession({
      bearerToken: accessToken,
    });
    if (isResultError(loaded)) throw loaded.error;
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
  const loginController = defineValidatedController({
    request: { body: loginRequestSchema },
    handle: async ({ body }, { request, response }) => {
      const authenticated = await input.application.login({
        ...body,
        ...processorRequestMetadata(request, response),
      });
      if (isResultError(authenticated)) throw authenticated.error;

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
            expiresAt: authenticated.value.expiresAt.toISOString(),
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
    },
  });
  const challengeController = defineValidatedController({
    request: { body: processorCompleteMfaChallengeRequestSchema },
    handle: async ({ body }, { request, response }) => {
      const challengeToken = readProcessorCookie(
        request.header('cookie'),
        input.names.mfa,
      );
      if (challengeToken === null)
        throw processorUnauthorized({
          code: 'processor_mfa_challenge_missing',
          message: 'Processor MFA challenge cookie is missing.',
        });

      const completed = await input.application.completeMfaChallenge({
        ...body,
        challengeToken,
        ...(processorRequestId(response) === undefined
          ? {}
          : { requestId: processorRequestId(response)! }),
      });
      if (isResultError(completed)) throw completed.error;

      clearProcessorCookie(response, input.names.mfa, input.options);
      await establishBrowserSession(
        response,
        completed.value.accessToken,
        completed.value.expiresAt,
      );
    },
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
    loginController.validate,
    loginController.handle,
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
    challengeController.validate,
    challengeController.handle,
  );

  routes.get('/session', async (request, response) => {
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
  });

  routes.post('/logout', async (request, response) => {
    const session = await input.loadCookieSession(request, response);
    const revoked = await input.application.revokeSession({
      bearerToken: session.sessionToken,
      ...(processorRequestId(response) === undefined
        ? {}
        : { requestId: processorRequestId(response)! }),
    });
    clearProcessorCookie(response, input.names.session, input.options);
    clearProcessorCookie(response, input.names.mfa, input.options);
    response.status(200).json(apiSuccess(revoked));
  });

  return routes;
};
