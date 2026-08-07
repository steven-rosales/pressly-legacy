import type {
  ProcessorAccess,
  ResolveProcessorAccess,
} from '@pressly/processor-experience';
import type { Request, Response, RequestHandler } from 'express';
import {
  clearProcessorCookie,
  readProcessorCookie,
  type ProcessorCookieNames,
} from './processor-cookie.adapter.ts';
import {
  processorRequestNeedsCsrf,
  requireProcessorCsrf,
} from './processor-csrf.adapter.ts';
import {
  processorForbidden,
  processorSessionFailureToAppError,
  processorUnauthorized,
} from './processor-session.error.ts';
import {
  isResultError,
  type LoadedProcessorSession,
  type ProcessorAuthApplication,
  type ProcessorSessionOptions,
} from './processor-session.port.ts';

export type LoadedCookieSession = Readonly<{
  loaded: LoadedProcessorSession;
  access: ProcessorAccess;
  sessionToken: string;
}>;

export type LoadProcessorCookieSession = (
  request: Request,
  response: Response,
) => Promise<LoadedCookieSession>;

export const makeProcessorSessionAuthentication = (input: {
  application: ProcessorAuthApplication;
  resolveAccess: ResolveProcessorAccess;
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
      throw processorSessionFailureToAppError(loaded.error);
    }

    const access = await input.resolveAccess(loaded.value);
    if (access === null) {
      clearProcessorCookie(response, input.names.session, input.options);
      throw processorForbidden({
        code: 'processor_access_unavailable',
        message:
          'Identity has no active production capability at an active location.',
        safeMessage: 'Your account does not have access to Pressly Processor.',
      });
    }

    response.locals['auth'] = loaded.value;
    response.locals['processorAccess'] = access;
    response.locals['processorSessionToken'] = sessionToken;
    return { loaded: loaded.value, access, sessionToken };
  };

  const authenticate: RequestHandler = async (request, response, next) => {
    if (
      request.header('authorization') !== undefined ||
      readProcessorCookie(request.header('cookie'), input.names.session) ===
        null
    ) {
      await input.bearerAuthenticate(request, response, next);
      return;
    }

    await loadCookieSession(request, response);
    next();
  };

  return { loadCookieSession, authenticate };
};
