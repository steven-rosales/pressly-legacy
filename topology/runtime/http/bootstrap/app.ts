import { revealSecret } from '@pressly/config';
import type { AppError } from '@pressly/errors/app-error';
import type { IdSource } from '@pressly/cells/id-source';
import type {
  ExecutableEventStreamCatalog,
  ExecutableHttpCatalog,
} from '@pressly/cells';
import {
  attemptObservation,
  nullMeasurementSink,
  nullTraceSink,
  observeResultUnitOfWork,
} from '@pressly/observability';
import type { ProductionChangeFeed } from '@pressly/production-system';
import {
  makeProductionDomainSignals,
  productionHttpCounterSignals,
} from '@pressly/production-system/observability/signals';
import { receiveCentsWebhookCounterSignals } from '@pressly/ingress-system';
import {
  acceptUnsignedCentsWebhook,
  makeCentsWebhookHmacVerifier,
  makeCentsWebhookPayloadCipher,
  type CentsWebhookVerifier,
} from '@pressly/ingress-system/sources/cents';
import type { Clock } from '@pressly/time';
import type { ApiRuntime } from '../runtime/types.ts';
import {
  makeApiTargetAuthenticationProviders,
  makeApiTargetBrowserPresentation,
  type ApiTargetRealmOptions,
} from './target-authentication-providers.ts';
import {
  type ApiHttpBoundaryMechanisms,
  type ApiAccessPolicyAuthorization,
  type EventStreamBoundaryOperation,
  makeApiHttpBoundaryProviders,
  type ApiHttpBoundaryProviders,
  readApiAuthenticatedPrincipal,
} from './http-boundary-providers.ts';
import type {
  ApiBoundaryRequest,
  ApiBoundaryRequestHandler,
  ApiBoundaryResponse,
  ApiHttpBoundaryMiddlewareProvider,
  RateLimitStore,
} from './boundary-provider-types.ts';
import { makeApiTargetOwners, type ApiTargetOwners } from './target-owners.ts';

export type ApiCompositionOverrides = Readonly<{
  centsWebhookVerifier?: CentsWebhookVerifier;
  clock: Clock;
  ids: IdSource;
  productionChanges?: ProductionChangeFeed;
}>;

export type ApiRuntimeCatalogs = Readonly<{
  makeHttpCatalog: (owners: {
    'experience:control': ApiTargetOwners['experiences']['control'];
    'experience:customer': ApiTargetOwners['experiences']['customer'];
    'experience:processor': ApiTargetOwners['experiences']['processor'];
    'system:ingress': ApiTargetOwners['systems']['ingress'];
    'system:orders': ApiTargetOwners['systems']['orders'];
    'system:pricing': ApiTargetOwners['systems']['pricing'];
    'system:production': ApiTargetOwners['systems']['production'];
  }) => ExecutableHttpCatalog;
  makeEventStreamCatalog: (owners: {
    'system:production': ApiTargetOwners['systems']['production'];
  }) => ExecutableEventStreamCatalog;
}>;

type ApiBoundaryErrorObservation<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
  Response extends ApiBoundaryResponse = ApiBoundaryResponse,
> = Readonly<{
  appError: AppError;
  requestId: string | undefined;
  request: Request;
  response: Response;
}>;

export type ApiApplicationAssembly<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
  Response extends ApiBoundaryResponse = ApiBoundaryResponse,
> = Readonly<{
  runtime: ApiRuntime;
  configuration: Readonly<{
    nodeEnv: ApiRuntime['env']['nodeEnv'];
    corsOrigin: string;
    globalRateLimit: Readonly<{ limit: number; windowMs: number }>;
  }>;
  httpCatalog: ExecutableHttpCatalog;
  boundaryProviders: ApiHttpBoundaryProviders<Request, Response>['providers'];
  observeResponse: (input: {
    operation: Readonly<{ operationId: string }>;
    status: number;
  }) => void;
  rateLimitStore: RateLimitStore;
  eventStream: Readonly<{
    catalog: ExecutableEventStreamCatalog;
    authenticate: ApiBoundaryRequestHandler<Request, Response>;
    authorize: (
      input: Readonly<{
        operation: EventStreamBoundaryOperation;
        request: Request;
        response: Response;
        capability: string;
        scope: string;
      }>,
    ) => Promise<void>;
    readActorId: (response: Response) => string;
    counters: ApiRuntime['observability']['counters'];
    measurements: NonNullable<ApiRuntime['observability']['measurements']>;
  }> | null;
  observeBoundaryError: (
    input: ApiBoundaryErrorObservation<Request, Response>,
  ) => void;
}>;

const boundaryOperation = (input: {
  operationId: string;
  observability: string;
  method: 'GET' | 'POST';
  path: string;
  authorization: Readonly<{
    capability: string;
    timing: 'before-input';
  }> | null;
}) =>
  Object.freeze({
    ...input,
    bodyLimit: input.method === 'POST' ? '64kb' : null,
    authentication: 'required' as const,
    contextRequirements: Object.freeze([]),
    boundaryProfileId: 'api-retained-route-v1',
  });

const providerHandler = <
  Request extends ApiBoundaryRequest,
  Response extends ApiBoundaryResponse,
>(
  provider: ApiHttpBoundaryMiddlewareProvider<Request, Response>,
  operation: ReturnType<typeof boundaryOperation>,
): ApiBoundaryRequestHandler<Request, Response> =>
  provider({
    kind: 'authentication',
    operation,
    provider: 'processor-cookie-or-bearer-session',
    required: true,
  });

const observeIngressBoundaryError = (
  runtime: ApiRuntime,
  clock: Clock,
  input: ApiBoundaryErrorObservation,
): void => {
  if (
    input.response.locals['webhookSource'] === 'cents' &&
    input.appError.status >= 400 &&
    input.appError.status < 500
  )
    runtime.observability.counters.increment('api.webhook_rejections', {
      source: 'cents',
      reason: input.appError.code,
      status: String(input.appError.status),
    });

  if (input.appError.code === 'invalid_cents_webhook_authentication')
    runtime.securityEvents.emit({
      name: 'vendor.webhook_authentication_failed',
      occurredAt: clock.now().toISOString(),
      outcome: 'denied',
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
      resourceType: 'http.route',
      resourceId: input.request.path,
      reason: input.appError.code,
    });
};

export const composeApiApplication = <
  Request extends ApiBoundaryRequest,
  Response extends ApiBoundaryResponse,
>(
  runtime: ApiRuntime,
  catalogs: ApiRuntimeCatalogs,
  rateLimitStore: RateLimitStore,
  mechanisms: ApiHttpBoundaryMechanisms<Request, Response>,
  overrides: ApiCompositionOverrides,
): ApiApplicationAssembly<Request, Response> => {
  const clock = overrides.clock;
  const ids = overrides.ids;
  const secureCookies = runtime.env.nodeEnv === 'production';
  const controlRealm: ApiTargetRealmOptions = Object.freeze({
    origin: runtime.env.control.origin,
    csrfSecret: revealSecret(runtime.env.control.csrfSecret),
    secureCookies,
  });
  const processorRealm: ApiTargetRealmOptions = Object.freeze({
    origin: runtime.env.processor.origin,
    csrfSecret: revealSecret(runtime.env.processor.csrfSecret),
    secureCookies,
  });
  const transactions = {
    counters: runtime.observability.counters,
    measurements: runtime.observability.measurements ?? nullMeasurementSink,
    trace: runtime.observability.trace ?? nullTraceSink,
    nowNanoseconds: runtime.nowNanoseconds,
  };

  const centsWebhookPayloadCipher =
    runtime.env.centsWebhook.quarantine.encryptionKey === undefined
      ? undefined
      : makeCentsWebhookPayloadCipher(
          revealSecret(runtime.env.centsWebhook.quarantine.encryptionKey),
        );
  const configuredCentsWebhookVerifier =
    runtime.env.centsWebhook.authMode === 'unsigned'
      ? acceptUnsignedCentsWebhook
      : makeCentsWebhookHmacVerifier({
          ...(runtime.env.centsWebhook.hmac.currentKey === undefined
            ? {}
            : {
                currentKey: revealSecret(
                  runtime.env.centsWebhook.hmac.currentKey,
                ),
              }),
          ...(runtime.env.centsWebhook.hmac.previousKey === undefined
            ? {}
            : {
                previousKey: revealSecret(
                  runtime.env.centsWebhook.hmac.previousKey,
                ),
              }),
          now: clock.now,
          clockWindowSeconds: runtime.env.centsWebhook.hmac.clockWindowSeconds,
        });

  const owners = makeApiTargetOwners({
    db: runtime.database.db,
    clock,
    ids,
    access: {
      tokenSecret: revealSecret(runtime.env.auth.secret),
      sessionTtlMinutes: runtime.env.auth.sessionTtlMinutes,
      sessionIdleTimeoutMinutes: runtime.env.auth.sessionIdleTimeoutMinutes,
      loginWindowMinutes: runtime.env.auth.loginWindowMinutes,
      loginMaxFailures: runtime.env.auth.loginMaxFailures,
      mfaChallengeTtlMinutes: runtime.env.auth.mfaChallengeTtlMinutes,
      mfaChallengeMaxAttempts: runtime.env.auth.mfaChallengeMaxAttempts,
      mfaEncryptionKey: revealSecret(runtime.env.auth.mfaEncryptionKey),
      mfaIssuer: runtime.env.auth.mfaIssuer,
      securityEvents: runtime.securityEvents,
      transactions,
      policies: {
        pricing: {
          freshSessionMaxAgeMinutes: runtime.env.auth.freshSessionMaxAgeMinutes,
        },
        authSessions: {
          freshSessionMaxAgeMinutes: runtime.env.auth.freshSessionMaxAgeMinutes,
        },
        mfa: {
          freshSessionMaxAgeMinutes: runtime.env.auth.freshSessionMaxAgeMinutes,
        },
      },
    },
    production: {
      ...(overrides.productionChanges === undefined
        ? {}
        : { changeSource: overrides.productionChanges }),
      signals: makeProductionDomainSignals(runtime.observability.counters),
      observeUnitOfWork: (unitOfWork) =>
        observeResultUnitOfWork({
          ...transactions,
          operation: 'production.advance_stage',
          unitOfWork,
        }),
      observeCellUnitOfWork: (operation, unitOfWork) =>
        observeResultUnitOfWork({
          ...transactions,
          operation,
          unitOfWork,
        }),
    },
    ingress: {
      quarantineRetentionMs: runtime.env.centsWebhook.quarantine.retentionMs,
      ...(centsWebhookPayloadCipher === undefined
        ? {}
        : { cents: { payloadCipher: centsWebhookPayloadCipher } }),
    },
    control: {
      origin: controlRealm.origin,
      presentation: makeApiTargetBrowserPresentation({
        realm: 'control',
        options: controlRealm,
      }),
    },
    processor: {
      origin: processorRealm.origin,
      presentation: makeApiTargetBrowserPresentation({
        realm: 'processor',
        options: processorRealm,
      }),
    },
  });

  const authentication = makeApiTargetAuthenticationProviders<
    Request,
    Response
  >({
    access: owners.systems.access,
    control: owners.experiences.control,
    processor: owners.experiences.processor,
    controlRealm,
    processorRealm,
  });
  const boundaryProviders = makeApiHttpBoundaryProviders({
    owners,
    authentication,
    runtime,
    clock,
    rateLimitStore,
    centsWebhookVerifier:
      overrides.centsWebhookVerifier ?? configuredCentsWebhookVerifier,
    mechanisms,
  });
  const httpCatalog = catalogs.makeHttpCatalog({
    'experience:control': owners.experiences.control,
    'experience:customer': owners.experiences.customer,
    'experience:processor': owners.experiences.processor,
    'system:ingress': owners.systems.ingress,
    'system:orders': owners.systems.orders,
    'system:pricing': owners.systems.pricing,
    'system:production': owners.systems.production,
  });
  if (
    overrides.centsWebhookVerifier === undefined &&
    runtime.env.centsWebhook.authMode === 'unsigned'
  )
    attemptObservation(() =>
      runtime.logger.warn(
        'Cents webhook authentication is disabled by configuration.',
        { route: '/webhooks/cents', authMode: 'unsigned' },
      ),
    );

  const eventStream = (() => {
    if (overrides.productionChanges === undefined) return null;
    const eventOperation = boundaryOperation({
      operationId: 'production.subscribe-changes.v1',
      observability: 'production.subscribe_changes',
      method: 'GET',
      path: '/production/locations/:locationId/events',
      authorization: {
        capability: 'production:read',
        timing: 'before-input',
      },
    });
    return {
      catalog: catalogs.makeEventStreamCatalog({
        'system:production': owners.systems.production,
      }),
      authenticate: providerHandler(
        authentication.middleware['processor-cookie-or-bearer-session'],
        eventOperation,
      ),
      authorize: (
        input: Parameters<ApiAccessPolicyAuthorization<Request, Response>>[0],
      ) => boundaryProviders.authorizeAccessPolicy(input),
      readActorId: (response: Response) =>
        readApiAuthenticatedPrincipal(response).identityId,
      counters: runtime.observability.counters,
      measurements: runtime.observability.measurements ?? nullMeasurementSink,
    };
  })();

  return Object.freeze({
    runtime,
    configuration: {
      nodeEnv: runtime.env.nodeEnv,
      corsOrigin: runtime.env.corsOrigin,
      globalRateLimit: runtime.env.rateLimits.global,
    },
    httpCatalog,
    boundaryProviders: boundaryProviders.providers,
    observeResponse: ({
      operation,
      status,
    }: {
      operation: Readonly<{ operationId: string }>;
      status: number;
    }) => {
      for (const signal of [
        ...receiveCentsWebhookCounterSignals({
          operationId: operation.operationId,
          status,
        }),
        ...productionHttpCounterSignals({
          operationId: operation.operationId,
          status,
        }),
      ])
        attemptObservation(() =>
          runtime.observability.counters.increment(
            signal.name,
            signal.attributes,
          ),
        );
    },
    rateLimitStore,
    eventStream,
    observeBoundaryError: (
      input: ApiBoundaryErrorObservation<Request, Response>,
    ) => observeIngressBoundaryError(runtime, clock, input),
  });
};
