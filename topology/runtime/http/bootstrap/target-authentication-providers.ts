import type { AccessSystem } from '@pressly/access-system';
import { readCookieValue } from '@pressly/auth-platform/cookies';
import { defineSessionCsrfProof } from '@pressly/auth-platform/csrf';
import type {
  ControlBrowserPresentation,
  ControlCookieMutation,
  ControlExperience,
} from '@pressly/experience-control';
import type {
  ProcessorBrowserPresentation,
  ProcessorCookieMutation,
  ProcessorExperience,
} from '@pressly/experience-processor/server';
import {
  authError,
  invariantViolationError,
  permissionError,
} from '@pressly/errors/factories';
import type {
  ApiBoundaryRequest,
  ApiBoundaryRequestHandler,
  ApiBoundaryResponse,
  ApiHttpBoundaryContextProvider,
  ApiHttpBoundaryMiddlewareProvider,
} from './boundary-provider-types.ts';

export type ApiTargetRealmOptions = Readonly<{
  origin: string;
  csrfSecret: string;
  secureCookies: boolean;
}>;

export type ApiTargetAuthenticationProviderDependencies = Readonly<{
  access: Pick<AccessSystem, 'cells'>;
  control: Pick<ControlExperience, 'cells'>;
  processor: Pick<ProcessorExperience, 'cells'>;
  controlRealm: ApiTargetRealmOptions;
  processorRealm: ApiTargetRealmOptions;
}>;

export type ApiTargetAuthenticationProviders<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
  Response extends ApiBoundaryResponse = ApiBoundaryResponse,
> = Readonly<{
  middleware: Readonly<{
    'bearer-session': ApiHttpBoundaryMiddlewareProvider<Request, Response>;
    'control-bearer-session': ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >;
    'control-cookie-session': ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >;
    'processor-cookie-or-bearer-session': ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >;
    'control-exact-origin': ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >;
    'processor-exact-origin': ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >;
    'control-cookie-csrf': ApiHttpBoundaryMiddlewareProvider<Request, Response>;
    'processor-cookie-csrf': ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >;
  }>;
  context: Readonly<{
    'control-session-cookie': ApiHttpBoundaryContextProvider<Request, Response>;
    'control-mfa-cookie': ApiHttpBoundaryContextProvider<Request, Response>;
    'processor-session-cookie': ApiHttpBoundaryContextProvider<
      Request,
      Response
    >;
    'processor-mfa-cookie': ApiHttpBoundaryContextProvider<Request, Response>;
  }>;
  cookieNames: Readonly<{
    control: Readonly<{ session: string; mfa: string }>;
    processor: Readonly<{ session: string; mfa: string }>;
  }>;
}>;

const controlCsrf = defineSessionCsrfProof('pressly.control.csrf.v1\0');
const processorCsrf = defineSessionCsrfProof('pressly.processor.csrf.v1\0');
const unsafeMethod = (method: string): boolean =>
  !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

const realmCookieNames = (realm: 'control' | 'processor', secure: boolean) =>
  Object.freeze({
    session: secure
      ? `__Host-pressly-${realm}-session`
      : `pressly_${realm}_session`,
    mfa: secure ? `__Host-pressly-${realm}-mfa` : `pressly_${realm}_mfa`,
  });

type RealmCookieMutation = ControlCookieMutation | ProcessorCookieMutation;

const serializeRealmCookie = (input: {
  mutation: RealmCookieMutation;
  name: string;
  secure: boolean;
}): string => {
  const value =
    input.mutation.action === 'set'
      ? encodeURIComponent(input.mutation.value)
      : '';
  const expires =
    input.mutation.action === 'set' ? input.mutation.expiresAt : new Date(1);
  return `${input.name}=${value}; Path=/; Expires=${expires.toUTCString()}; HttpOnly${input.secure ? '; Secure' : ''}; SameSite=Strict`;
};

export function makeApiTargetBrowserPresentation(input: {
  realm: 'control';
  options: ApiTargetRealmOptions;
}): ControlBrowserPresentation;
export function makeApiTargetBrowserPresentation(input: {
  realm: 'processor';
  options: ApiTargetRealmOptions;
}): ProcessorBrowserPresentation;
export function makeApiTargetBrowserPresentation(input: {
  realm: 'control' | 'processor';
  options: ApiTargetRealmOptions;
}): ControlBrowserPresentation | ProcessorBrowserPresentation {
  const names = realmCookieNames(input.realm, input.options.secureCookies);
  const proof = input.realm === 'control' ? controlCsrf : processorCsrf;
  return Object.freeze({
    deriveCsrfToken: (sessionToken: string) =>
      proof.derive(sessionToken, input.options.csrfSecret),
    serializeCookies: (mutations: readonly RealmCookieMutation[]) =>
      mutations.map((mutation) =>
        serializeRealmCookie({
          mutation,
          name: names[mutation.cookie],
          secure: input.options.secureCookies,
        }),
      ),
  });
}

const clearSessionCookie = (
  response: ApiBoundaryResponse,
  name: string,
  secure: boolean,
): void => {
  response.clearCookie(name, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
  });
};

const missingBearerToken = (): never => {
  throw authError({
    code: 'missing_bearer_token',
    message: 'Bearer token is required.',
    safeMessage: 'Authentication is required.',
  });
};

const bearerToken = (request: ApiBoundaryRequest): string => {
  const authorization = request.header('authorization');
  if (authorization === undefined) return missingBearerToken();
  const [scheme, token] = authorization.split(' ');
  return scheme === 'Bearer' && token !== undefined && token.trim() !== ''
    ? token
    : missingBearerToken();
};

const missingRealmSession = (realm: 'control' | 'processor'): never => {
  throw authError({
    code: `${realm}_session_missing`,
    message: `${realm === 'control' ? 'Control' : 'Processor'} session cookie is missing.`,
    safeMessage: 'Authentication is required.',
  });
};

const rejectedOrigin = (realm: 'control' | 'processor'): never => {
  throw permissionError({
    code: `${realm}_origin_rejected`,
    message: `${realm === 'control' ? 'Control' : 'Processor'} request origin did not match the configured origin.`,
    safeMessage:
      realm === 'control'
        ? 'This Control request was rejected.'
        : 'This processor request was rejected.',
  });
};

const rejectedCsrf = (realm: 'control' | 'processor'): never => {
  throw permissionError({
    code: `${realm}_csrf_rejected`,
    message: `${realm === 'control' ? 'Control' : 'Processor'} request did not include a valid CSRF proof.`,
    safeMessage:
      realm === 'control'
        ? 'This Control request was rejected.'
        : 'This processor request was rejected.',
  });
};

const exactOrigin =
  <Request extends ApiBoundaryRequest, Response extends ApiBoundaryResponse>(
    realm: 'control' | 'processor',
    origin: string,
  ): ApiBoundaryRequestHandler<Request, Response> =>
  (request, _response, next) => {
    if (request.header('origin') === origin) {
      next();
      return;
    }
    next(rejectedOrigin(realm));
  };

const csrfProof =
  <
    Request extends ApiBoundaryRequest,
    Response extends ApiBoundaryResponse,
  >(input: {
    realm: 'control' | 'processor';
    sessionCookieName: string;
    secret: string;
    proof: ReturnType<typeof defineSessionCsrfProof>;
  }): ApiBoundaryRequestHandler<Request, Response> =>
  (request, _response, next) => {
    const sessionToken = readCookieValue(
      request.header('cookie'),
      input.sessionCookieName,
    );
    if (sessionToken === null) return next(missingRealmSession(input.realm));
    if (
      input.proof.verify(
        request.header('x-csrf-token'),
        sessionToken,
        input.secret,
      )
    ) {
      next();
      return;
    }
    next(rejectedCsrf(input.realm));
  };

const loadedSessionFailure = (failure: {
  code: string;
  message: string;
}): never => {
  throw authError({
    code: failure.code,
    message: failure.message,
    safeMessage: failure.message,
  });
};

const unexpectedResolverFailure = (realm: 'control' | 'processor'): never => {
  throw invariantViolationError({
    code: `${realm}_access_resolver_unexpected_failure`,
    message: `${realm === 'control' ? 'Control' : 'Processor'} access resolver returned an undeclared failure.`,
    safeMessage: 'Access could not be resolved.',
  });
};

const controlAccessUnavailable = (): never => {
  throw permissionError({
    code: 'control_access_unavailable',
    message:
      'Identity has no unambiguous active owner or manager Control access.',
    safeMessage: 'Your account does not have access to Pressly Control.',
  });
};

export const makeApiTargetAuthenticationProviders = <
  Request extends ApiBoundaryRequest,
  Response extends ApiBoundaryResponse,
>(
  dependencies: ApiTargetAuthenticationProviderDependencies,
): ApiTargetAuthenticationProviders<Request, Response> => {
  const controlNames = realmCookieNames(
    'control',
    dependencies.controlRealm.secureCookies,
  );
  const processorNames = realmCookieNames(
    'processor',
    dependencies.processorRealm.secureCookies,
  );

  const loadBearer = async (request: Request, response: Response) => {
    const loaded = await dependencies.access.cells.loadSession.execute({
      bearerToken: bearerToken(request),
    });
    if (loaded.kind === 'failure') return loadedSessionFailure(loaded.failure);
    response.locals['auth'] = loaded.value;
    return loaded.value;
  };

  const bearerAuthentication: ApiBoundaryRequestHandler<
    Request,
    Response
  > = async (request, response, next) => {
    await loadBearer(request, response);
    next();
  };

  const controlBearerAuthentication: ApiBoundaryRequestHandler<
    Request,
    Response
  > = async (request, response, next) => {
    const token = bearerToken(request);
    const loaded = await dependencies.access.cells.loadSession.execute({
      bearerToken: token,
    });
    if (loaded.kind === 'failure') return loadedSessionFailure(loaded.failure);

    const resolved =
      loaded.value.principal.audience === 'customer'
        ? null
        : await dependencies.control.cells.resolveAccess.execute({
            identityId: loaded.value.principal.identityId,
            ...(loaded.value.principalAttributes.assuranceLevel === undefined
              ? {}
              : {
                  assuranceLevel:
                    loaded.value.principalAttributes.assuranceLevel,
                }),
          });
    if (resolved !== null && resolved.kind === 'failure')
      return unexpectedResolverFailure('control');
    const access = resolved === null ? null : resolved.value;
    if (access === null) {
      await dependencies.access.cells.revokeSession.execute({
        bearerToken: token,
      });
      return controlAccessUnavailable();
    }

    response.locals['auth'] = loaded.value;
    response.locals['controlAccess'] = access;
    response.locals['controlSessionToken'] = token;
    next();
  };

  const controlAuthentication: ApiBoundaryRequestHandler<
    Request,
    Response
  > = async (request, response, next) => {
    const sessionToken = readCookieValue(
      request.header('cookie'),
      controlNames.session,
    );
    if (sessionToken === null) return missingRealmSession('control');
    const loaded = await dependencies.access.cells.loadSession.execute({
      bearerToken: sessionToken,
    });
    if (loaded.kind === 'failure') {
      clearSessionCookie(
        response,
        controlNames.session,
        dependencies.controlRealm.secureCookies,
      );
      return loadedSessionFailure(loaded.failure);
    }
    const resolved = await dependencies.control.cells.resolveAccess.execute({
      identityId: loaded.value.principal.identityId,
      ...(loaded.value.principalAttributes.assuranceLevel === undefined
        ? {}
        : {
            assuranceLevel: loaded.value.principalAttributes.assuranceLevel,
          }),
    });
    if (resolved.kind === 'failure')
      return unexpectedResolverFailure('control');
    if (resolved.value === null) {
      clearSessionCookie(
        response,
        controlNames.session,
        dependencies.controlRealm.secureCookies,
      );
      return controlAccessUnavailable();
    }
    response.locals['auth'] = loaded.value;
    response.locals['controlAccess'] = resolved.value;
    response.locals['controlSessionToken'] = sessionToken;
    next();
  };

  const processorAuthentication: ApiBoundaryRequestHandler<
    Request,
    Response
  > = async (request, response, next) => {
    const sessionToken = readCookieValue(
      request.header('cookie'),
      processorNames.session,
    );
    if (
      request.header('authorization') !== undefined ||
      sessionToken === null
    ) {
      await loadBearer(request, response);
      next();
      return;
    }
    if (unsafeMethod(request.method)) {
      if (request.header('origin') !== dependencies.processorRealm.origin)
        return rejectedOrigin('processor');
      if (
        !processorCsrf.verify(
          request.header('x-csrf-token'),
          sessionToken,
          dependencies.processorRealm.csrfSecret,
        )
      )
        return rejectedCsrf('processor');
    }
    const loaded = await dependencies.access.cells.loadSession.execute({
      bearerToken: sessionToken,
    });
    if (loaded.kind === 'failure') {
      clearSessionCookie(
        response,
        processorNames.session,
        dependencies.processorRealm.secureCookies,
      );
      return loadedSessionFailure(loaded.failure);
    }
    const resolved = await dependencies.processor.cells.resolveAccess.execute(
      loaded.value,
    );
    if (resolved.kind === 'failure')
      return unexpectedResolverFailure('processor');
    if (resolved.value === null) {
      clearSessionCookie(
        response,
        processorNames.session,
        dependencies.processorRealm.secureCookies,
      );
      throw permissionError({
        code: 'processor_access_unavailable',
        message:
          'Identity has no active production capability at an active location.',
        safeMessage: 'Your account does not have access to Pressly Processor.',
      });
    }
    response.locals['auth'] = loaded.value;
    response.locals['processorAccess'] = resolved.value;
    response.locals['processorSessionToken'] = sessionToken;
    next();
  };

  const middleware = Object.freeze({
    'bearer-session': (() =>
      bearerAuthentication) satisfies ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >,
    'control-bearer-session': (() =>
      controlBearerAuthentication) satisfies ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >,
    'control-cookie-session': (() =>
      controlAuthentication) satisfies ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >,
    'processor-cookie-or-bearer-session': (() =>
      processorAuthentication) satisfies ApiHttpBoundaryMiddlewareProvider<
      Request,
      Response
    >,
    'control-exact-origin': (() =>
      exactOrigin(
        'control',
        dependencies.controlRealm.origin,
      )) satisfies ApiHttpBoundaryMiddlewareProvider<Request, Response>,
    'processor-exact-origin': (() =>
      exactOrigin(
        'processor',
        dependencies.processorRealm.origin,
      )) satisfies ApiHttpBoundaryMiddlewareProvider<Request, Response>,
    'control-cookie-csrf': (() =>
      csrfProof({
        realm: 'control',
        sessionCookieName: controlNames.session,
        secret: dependencies.controlRealm.csrfSecret,
        proof: controlCsrf,
      })) satisfies ApiHttpBoundaryMiddlewareProvider<Request, Response>,
    'processor-cookie-csrf': (() =>
      csrfProof({
        realm: 'processor',
        sessionCookieName: processorNames.session,
        secret: dependencies.processorRealm.csrfSecret,
        proof: processorCsrf,
      })) satisfies ApiHttpBoundaryMiddlewareProvider<Request, Response>,
  });

  const cookieContext =
    (
      realm: 'control' | 'processor',
      cookie: 'mfa' | 'session',
    ): ApiHttpBoundaryContextProvider<Request, Response> =>
    ({ request }) => {
      const names = realm === 'control' ? controlNames : processorNames;
      const token = readCookieValue(request.header('cookie'), names[cookie]);
      if (token === null) return Object.freeze({});
      return Object.freeze({
        [cookie === 'session' ? 'sessionToken' : 'challengeToken']: token,
      });
    };

  return Object.freeze({
    middleware,
    context: Object.freeze({
      'control-session-cookie': cookieContext('control', 'session'),
      'control-mfa-cookie': cookieContext('control', 'mfa'),
      'processor-session-cookie': cookieContext('processor', 'session'),
      'processor-mfa-cookie': cookieContext('processor', 'mfa'),
    }),
    cookieNames: Object.freeze({
      control: controlNames,
      processor: processorNames,
    }),
  });
};
