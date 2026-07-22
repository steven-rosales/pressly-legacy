import { catchAsync } from '@pressly/http/express';
import type { Request, Response, RequestHandler } from 'express';
import {
  clearProcessorCookie,
  readProcessorCookie,
  type ProcessorCookieNames,
} from './processor-cookie.adapter.ts';
import {
  processorRequestNeedsCsrf,
  requireProcessorCsrf,
} from './processor-csrf.policy.ts';
import { processorUnauthorized } from './processor-session.error.ts';
import {
  isResultError,
  type LoadedProcessorSession,
  type ProcessorAuthApplication,
  type ProcessorSessionOptions,
} from './processor-session.port.ts';

export type LoadedCookieSession = Readonly<{
  loaded: LoadedProcessorSession;
  sessionToken: string;
}>;

export type LoadProcessorCookieSession = (
  request: Request,
  response: Response,
) => Promise<LoadedCookieSession>;

export const makeProcessorSessionAuthentication = (input: {
  application: ProcessorAuthApplication;
  bearerAuthenticate: RequestHandler;
  names: ProcessorCookieNames;
  options: ProcessorSessionOptions;
}): Readonly<{
  loadCookieSession: LoadProcessorCookieSession;
  authenticate: RequestHandler;
}> => {
  const loadCookieSession: LoadProcessorCookieSession = async (
    request,
    response,
  ) => {
    const sessionToken = readProcessorCookie(
      request.header('cookie'),
      input.names.session,
    );
    if (sessionToken === null)
      throw processorUnauthorized({
        code: 'processor_session_missing',
        message: 'Processor session cookie is missing.',
      });

    if (processorRequestNeedsCsrf(request.method))
      requireProcessorCsrf(request, sessionToken, input.options);

    const loaded = await input.application.loadSession({
      bearerToken: sessionToken,
    });
    if (isResultError(loaded)) {
      clearProcessorCookie(response, input.names.session, input.options);
      throw loaded.error;
    }

    response.locals['auth'] = loaded.value;
    response.locals['processorSessionToken'] = sessionToken;
    return { loaded: loaded.value, sessionToken };
  };

  const authenticate = catchAsync(async (request, response, next) => {
    if (
      request.header('authorization') !== undefined ||
      readProcessorCookie(request.header('cookie'), input.names.session) ===
        null
    ) {
      input.bearerAuthenticate(request, response, next);
      return;
    }

    await loadCookieSession(request, response);
    next();
  });

  return { loadCookieSession, authenticate };
};
