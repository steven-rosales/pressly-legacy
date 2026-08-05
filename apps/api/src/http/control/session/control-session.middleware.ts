import type {
  ControlAccess,
  ControlCapability,
} from '@pressly/control-experience';
import type { Request, Response, RequestHandler } from 'express';
import {
  clearControlCookie,
  readControlCookie,
  type ControlCookieNames,
} from './control-cookie.adapter.ts';
import {
  controlRequestNeedsCsrf,
  requireControlCsrf,
} from './control-csrf.adapter.ts';
import {
  controlForbidden,
  controlUnauthorized,
} from './control-session.error.ts';
import {
  isControlResultError,
  type ControlAuthApplication,
  type ControlSessionOptions,
  type LoadedControlSession,
  type ResolveControlAccess,
} from './control-session.port.ts';

export type LoadedControlCookieSession = Readonly<{
  loaded: LoadedControlSession;
  access: ControlAccess;
  sessionToken: string;
}>;

export type LoadControlCookieSession = (
  request: Request,
  response: Response,
) => Promise<LoadedControlCookieSession>;

export const makeControlSessionAuthentication = (input: {
  application: ControlAuthApplication;
  resolveAccess: ResolveControlAccess;
  names: ControlCookieNames;
  options: ControlSessionOptions;
}): Readonly<{
  loadCookieSession: LoadControlCookieSession;
  authenticate: RequestHandler;
  requireCapability: (capability: ControlCapability) => RequestHandler;
  readAccess: (response: Response) => ControlAccess;
}> => {
  const loadCookieSession: LoadControlCookieSession = async (
    request,
    response,
  ) => {
    const sessionToken = readControlCookie(
      request.header('cookie'),
      input.names.session,
    );
    if (sessionToken === null)
      throw controlUnauthorized({
        code: 'control_session_missing',
        message: 'Control session cookie is missing.',
      });

    if (controlRequestNeedsCsrf(request.method))
      requireControlCsrf(request, sessionToken, input.options);

    const loaded = await input.application.loadSession({
      bearerToken: sessionToken,
    });
    if (isControlResultError(loaded)) {
      clearControlCookie(response, input.names.session, input.options);
      throw loaded.error;
    }

    const access = await input.resolveAccess(loaded.value);
    if (access === null) {
      clearControlCookie(response, input.names.session, input.options);

      throw controlForbidden({
        code: 'control_access_unavailable',
        message:
          'Identity has no unambiguous active owner or manager Control access.',
        safeMessage: 'Your account does not have access to Pressly Control.',
      });
    }

    response.locals['auth'] = loaded.value;
    response.locals['controlAccess'] = access;
    response.locals['controlSessionToken'] = sessionToken;
    return { loaded: loaded.value, access, sessionToken };
  };

  const authenticate: RequestHandler = async (request, response, next) => {
    await loadCookieSession(request, response);
    next();
  };

  const readAccess = (response: Response): ControlAccess => {
    const access = response.locals['controlAccess'] as
      | ControlAccess
      | undefined;
    if (access !== undefined) return access;

    throw controlUnauthorized({
      code: 'control_access_context_missing',
      message: 'Control authentication did not establish an access context.',
    });
  };

  const requireCapability =
    (capability: ControlCapability): RequestHandler =>
    (_request, response, next) => {
      try {
        if (readAccess(response).capabilities.includes(capability)) {
          next();
          return;
        }

        throw controlForbidden({
          code: 'control_capability_denied',
          message: `Control capability ${capability} was denied.`,
          safeMessage: 'You do not have permission to perform this action.',
        });
      } catch (error) {
        next(error);
      }
    };

  return {
    loadCookieSession,
    authenticate,
    requireCapability,
    readAccess,
  };
};
