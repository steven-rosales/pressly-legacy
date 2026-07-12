import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuthModule } from '@pressly/auth-module';
import {
  loginRequestSchema,
  processorCompleteMfaChallengeRequestSchema,
  type AuthPrincipalResult,
  type ProcessorAuthenticatedSession,
  type ProcessorCompleteMfaChallengeRequest,
} from '@pressly/contracts';
import { makeAppError, type AppError } from '@pressly/errors';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';

type AuthApplication = AuthModule['application'];
type ResultValue<T> = T extends { tag: 'ok'; value: infer Value }
  ? Value
  : never;
type LoadedSession = ResultValue<
  Awaited<ReturnType<AuthApplication['loadSession']>>
>;
type ResultLike<Value, Error> =
  | Readonly<{ tag: 'ok'; value: Value }>
  | Readonly<{ tag: 'err'; error: Error }>;

const isErr = <Value, Error>(
  value: ResultLike<Value, Error>,
): value is Readonly<{ tag: 'err'; error: Error }> => value.tag === 'err';

export type ProcessorSessionOptions = Readonly<{
  origin: string;
  csrfSecret: string;
  secureCookies: boolean;
}>;

export type ProcessorBrowserBoundary = Readonly<{
  routes: Router;
  authenticate: RequestHandler;
}>;

const csrfDomain = 'pressly.processor.csrf.v1\0';

const unauthorized = (input: {
  code: string;
  message: string;
  safeMessage?: string;
}): AppError =>
  makeAppError({
    kind: 'AuthError',
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage ?? 'Authentication is required.',
    status: 401,
  });

const forbidden = (input: {
  code: string;
  message: string;
  safeMessage: string;
}): AppError =>
  makeAppError({
    kind: 'PermissionError',
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage,
    status: 403,
  });

export const processorCookieNames = (
  secureCookies: boolean,
): Readonly<{ session: string; mfa: string }> =>
  secureCookies
    ? {
        session: '__Host-pressly-processor-session',
        mfa: '__Host-pressly-processor-mfa',
      }
    : {
        session: 'pressly_processor_session',
        mfa: 'pressly_processor_mfa',
      };

export const deriveProcessorCsrfToken = (
  sessionToken: string,
  csrfSecret: string,
): string =>
  createHmac('sha256', csrfSecret)
    .update(csrfDomain, 'utf8')
    .update(sessionToken, 'utf8')
    .digest('base64url');

const readCookie = (
  header: string | undefined,
  name: string,
): string | null => {
  if (header === undefined) return null;

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() !== name) continue;

    const value = pair.slice(separator + 1).trim();
    if (value.length === 0) return null;

    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
};

const cookieOptions = (options: ProcessorSessionOptions) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: options.secureCookies,
  path: '/',
});

const setOpaqueCookie = (
  response: Response,
  name: string,
  value: string,
  expiresAt: string,
  options: ProcessorSessionOptions,
): void => {
  response.cookie(name, value, {
    ...cookieOptions(options),
    expires: new Date(expiresAt),
  });
};

const clearOpaqueCookie = (
  response: Response,
  name: string,
  options: ProcessorSessionOptions,
): void => {
  response.clearCookie(name, cookieOptions(options));
};

const isUnsafeMethod = (method: string): boolean =>
  !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

const requireExactOrigin = (
  request: Request,
  options: ProcessorSessionOptions,
): void => {
  if (request.header('origin') === options.origin) return;

  throw forbidden({
    code: 'processor_origin_rejected',
    message: 'Processor request origin did not match the configured origin.',
    safeMessage: 'This processor request was rejected.',
  });
};

const equalToken = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    timingSafeEqual(leftBytes, rightBytes)
  );
};

const requireCsrf = (
  request: Request,
  sessionToken: string,
  options: ProcessorSessionOptions,
): void => {
  requireExactOrigin(request, options);
  const provided = request.header('x-csrf-token');
  const expected = deriveProcessorCsrfToken(sessionToken, options.csrfSecret);

  if (provided !== undefined && equalToken(provided, expected)) return;

  throw forbidden({
    code: 'processor_csrf_rejected',
    message: 'Processor request did not include a valid CSRF proof.',
    safeMessage: 'This processor request was rejected.',
  });
};

const rolesFromLoadedSession = (
  assignments: readonly {
    role: string;
    startsAt?: Date;
    endsAt?: Date;
  }[],
): AuthPrincipalResult['roles'] =>
  [
    ...new Set(
      assignments
        .filter((assignment) => {
          const now = new Date();
          return (
            (assignment.startsAt === undefined || assignment.startsAt <= now) &&
            (assignment.endsAt === undefined || assignment.endsAt > now)
          );
        })
        .map((assignment) => assignment.role),
    ),
  ] as AuthPrincipalResult['roles'];

const browserSessionFromLoaded = (
  loaded: LoadedSession,
  sessionToken: string,
  options: ProcessorSessionOptions,
): ProcessorAuthenticatedSession => {
  if (loaded.principal.sessionExpiresAt === undefined)
    throw makeAppError({
      kind: 'InvariantViolationError',
      code: 'loaded_session_missing_expiry',
      message: 'Loaded processor session is missing its expiry.',
      safeMessage: 'Session could not be loaded.',
      status: 500,
    });

  return {
    status: 'authenticated',
    principal: {
      identityId: loaded.principal.identityId,
      displayName: loaded.principal.displayName,
      ...(loaded.principal.email === undefined
        ? {}
        : { email: loaded.principal.email }),
      roles: rolesFromLoadedSession(loaded.principalAttributes.assignments),
    },
    expiresAt: loaded.principal.sessionExpiresAt.toISOString(),
    csrfToken: deriveProcessorCsrfToken(sessionToken, options.csrfSecret),
  };
};

const readRequestId = (response: Response): string | undefined =>
  response.locals['requestId'] as string | undefined;

const requestMetadata = (request: Request, response: Response) => ({
  ...(request.ip ? { ipAddress: request.ip } : {}),
  ...(request.header('user-agent') === undefined
    ? {}
    : { userAgent: request.header('user-agent')! }),
  ...(readRequestId(response) === undefined
    ? {}
    : { requestId: readRequestId(response)! }),
});

const sendFailure = (response: Response, error: AppError): void => {
  response.status(error.status).json(apiFailure(error));
};

export const makeProcessorBrowserBoundary = (input: {
  application: AuthApplication;
  bearerAuthenticate: RequestHandler;
  options: ProcessorSessionOptions;
}): ProcessorBrowserBoundary => {
  const names = processorCookieNames(input.options.secureCookies);
  const routes = Router();

  routes.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  const loadCookieSession = async (request: Request, response: Response) => {
    const sessionToken = readCookie(request.header('cookie'), names.session);
    if (sessionToken === null)
      throw unauthorized({
        code: 'processor_session_missing',
        message: 'Processor session cookie is missing.',
      });

    if (isUnsafeMethod(request.method))
      requireCsrf(request, sessionToken, input.options);

    const loaded = await input.application.loadSession({
      bearerToken: sessionToken,
    });
    if (isErr(loaded)) {
      clearOpaqueCookie(response, names.session, input.options);
      throw loaded.error;
    }

    response.locals['auth'] = loaded.value;
    response.locals['processorSessionToken'] = sessionToken;
    return { loaded: loaded.value, sessionToken };
  };

  routes.post(
    '/login',
    (request, _response, next) => {
      try {
        requireExactOrigin(request, input.options);
        next();
      } catch (error) {
        next(error);
      }
    },
    validateRequest({ body: loginRequestSchema }),
    catchAsync(async (request, response) => {
      const authenticated = await input.application.login({
        ...(request.body as { email: string; password: string }),
        ...requestMetadata(request, response),
      });
      if (isErr(authenticated)) {
        sendFailure(response, authenticated.error);
        return;
      }

      if ('challengeToken' in authenticated.value) {
        clearOpaqueCookie(response, names.session, input.options);
        setOpaqueCookie(
          response,
          names.mfa,
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

      clearOpaqueCookie(response, names.mfa, input.options);
      const loaded = await input.application.loadSession({
        bearerToken: authenticated.value.accessToken,
      });
      if (isErr(loaded)) {
        sendFailure(response, loaded.error);
        return;
      }
      setOpaqueCookie(
        response,
        names.session,
        authenticated.value.accessToken,
        authenticated.value.expiresAt,
        input.options,
      );
      response
        .status(200)
        .json(
          apiSuccess(
            browserSessionFromLoaded(
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
        requireExactOrigin(request, input.options);
        next();
      } catch (error) {
        next(error);
      }
    },
    validateRequest({ body: processorCompleteMfaChallengeRequestSchema }),
    catchAsync(async (request, response) => {
      const challengeToken = readCookie(request.header('cookie'), names.mfa);
      if (challengeToken === null)
        throw unauthorized({
          code: 'processor_mfa_challenge_missing',
          message: 'Processor MFA challenge cookie is missing.',
        });

      const body = request.body as ProcessorCompleteMfaChallengeRequest;
      const completed = await input.application.completeMfaChallenge({
        ...body,
        challengeToken,
        ...(readRequestId(response) === undefined
          ? {}
          : { requestId: readRequestId(response)! }),
      });
      if (isErr(completed)) {
        sendFailure(response, completed.error);
        return;
      }

      clearOpaqueCookie(response, names.mfa, input.options);
      const loaded = await input.application.loadSession({
        bearerToken: completed.value.accessToken,
      });
      if (isErr(loaded)) {
        sendFailure(response, loaded.error);
        return;
      }
      setOpaqueCookie(
        response,
        names.session,
        completed.value.accessToken,
        completed.value.expiresAt,
        input.options,
      );
      response
        .status(200)
        .json(
          apiSuccess(
            browserSessionFromLoaded(
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
      const session = await loadCookieSession(request, response);
      response
        .status(200)
        .json(
          apiSuccess(
            browserSessionFromLoaded(
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
      const session = await loadCookieSession(request, response);
      const revoked = await input.application.revokeSession({
        bearerToken: session.sessionToken,
        ...(readRequestId(response) === undefined
          ? {}
          : { requestId: readRequestId(response)! }),
      });
      if (isErr(revoked)) {
        sendFailure(response, revoked.error);
        return;
      }

      clearOpaqueCookie(response, names.session, input.options);
      clearOpaqueCookie(response, names.mfa, input.options);
      response.status(200).json(apiSuccess(revoked.value));
    }),
  );

  const authenticate = catchAsync(async (request, response, next) => {
    if (
      request.header('authorization') !== undefined ||
      readCookie(request.header('cookie'), names.session) === null
    ) {
      input.bearerAuthenticate(request, response, next);
      return;
    }

    await loadCookieSession(request, response);
    next();
  });

  return { routes, authenticate };
};
