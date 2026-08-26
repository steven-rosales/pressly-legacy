import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Secret } from '@pressly/config';
import {
  httpBoundaryProviderTokens,
  makeHttpCatalogFromOwners,
} from '@pressly/topology/http';
import {
  mountHttpBoundaryCatalog,
  type HttpBoundaryHostOperation,
} from '@pressly/http-host';
import type { Request, Response } from 'express';
import express from 'express';
import { describe, expect, it } from 'vitest';
import {
  assertApiHttpBoundaryProviderCoverage,
  makeApiHttpBoundaryHostDependencies,
  makeApiHttpBoundaryProviderRegistry,
} from '@pressly/http-host/runtime';
import { makeMemoryRateLimitStore } from '@pressly/http-host/runtime';
import type { ApiRuntime } from '@pressly/topology/runtime/http';
import { makeApiHttpBoundaryProviders } from '../../../../topology/runtime/http/bootstrap/http-boundary-providers.ts';
import { makeApiTargetAuthenticationProviders } from '../../../../topology/runtime/http/bootstrap/target-authentication-providers.ts';
import {
  makeApiBoundaryProviderFixture,
  makeApiTargetOwnerFixture,
} from './api-target.fixtures.ts';
import { apiTestMechanisms } from '../support/api-test-application.ts';
import { acceptUnsignedCentsWebhook } from '@pressly/ingress-system/sources/cents';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const sorted = (values: Iterable<string>): string[] => [...values].sort();

const realm = {
  control: {
    origin: 'https://control.pressly.test',
    csrfSecret: 'control-csrf-secret-at-least-32-bytes',
    secureCookies: false,
  },
  processor: {
    origin: 'https://processor.pressly.test',
    csrfSecret: 'processor-csrf-secret-at-least-32-bytes',
    secureCookies: false,
  },
} as const;

const runtimeFixture = (): ApiRuntime => ({
  env: {
    nodeEnv: 'test',
    shutdownGracePeriodMs: 1_000,
    host: '127.0.0.1',
    port: 0,
    databaseUrl:
      'postgres://fixture:fixture@127.0.0.1:1/pressly_api_unit_fixture_nonexistent',
    databaseMaxConnections: 1,
    corsOrigin: 'https://customer.pressly.test',
    rateLimits: {
      global: { limit: 1_000, windowMs: 60_000 },
      login: { limit: 1_000, windowMs: 60_000 },
      controlMutation: { limit: 1_000, windowMs: 60_000 },
      invitationAccept: { limit: 1_000, windowMs: 60_000 },
    },
    auth: {
      secret: 'test-auth-secret' as Secret,
      sessionTtlMinutes: 720,
      sessionIdleTimeoutMinutes: 60,
      loginWindowMinutes: 15,
      loginMaxFailures: 8,
      freshSessionMaxAgeMinutes: 15,
      mfaChallengeTtlMinutes: 5,
      mfaChallengeMaxAttempts: 8,
      mfaEncryptionKey: Buffer.alloc(32, 1).toString('base64') as Secret,
      mfaIssuer: 'Pressly Test',
    },
    processor: {
      origin: realm.processor.origin,
      csrfSecret: realm.processor.csrfSecret as Secret,
    },
    control: {
      origin: realm.control.origin,
      csrfSecret: realm.control.csrfSecret as Secret,
    },
    centsWebhook: {
      authMode: 'unsigned',
      hmac: {
        currentKey: undefined,
        previousKey: undefined,
        clockWindowSeconds: 300,
      },
      quarantine: { encryptionKey: undefined, retentionMs: 60_000 },
    },
    features: { metricsEnabled: false, jobsEnabled: false },
    observability: {
      sentry: {
        enabled: false,
        dsn: undefined,
        release: undefined,
        traceSampleRate: 0,
      },
    },
  },
  logger: {
    child: () => runtimeFixture().logger,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
  },
  securityEvents: { emit: () => undefined },
  observability: {
    errors: { capture: () => undefined, shutdown: async () => undefined },
    counters: { increment: () => undefined },
  },
  database: {
    db: {} as ApiRuntime['database']['db'],
    check: async () => undefined,
    listen: async () => async () => undefined,
    close: async () => undefined,
  },
  nowNanoseconds: () => 0n,
});

const catalogFrom = (owners: ReturnType<typeof makeApiTargetOwnerFixture>) =>
  makeHttpCatalogFromOwners({
    'experience:control': owners.experiences.control,
    'experience:customer': owners.experiences.customer,
    'experience:processor': owners.experiences.processor,
    'system:ingress': owners.systems.ingress,
    'system:orders': owners.systems.orders,
    'system:pricing': owners.systems.pricing,
    'system:production': owners.systems.production,
  });

describe('live topology API catalog composition', () => {
  it('assembles every selected owner route into one fully profiled catalog', () => {
    const owners = makeApiTargetOwnerFixture();
    const catalog = catalogFrom(owners);

    expect(Object.keys(owners.systems.access.cells)).toHaveLength(31);
    expect(Object.keys(owners.systems.customers.cells)).toHaveLength(5);
    expect(Object.keys(owners.systems.orders.cells)).toHaveLength(19);
    expect(Object.keys(owners.systems.pricing.cells)).toHaveLength(3);
    expect(Object.keys(owners.systems.ingress.cells)).toHaveLength(15);
    expect(Object.keys(owners.experiences.customer.cells)).toHaveLength(11);
    expect(Object.keys(owners.experiences.control.cells)).toHaveLength(47);
    expect(Object.keys(owners.experiences.processor.cells)).toHaveLength(12);
    expect(catalog.entries).toHaveLength(112);
    expect(
      new Set(catalog.entries.map(({ operationId }) => operationId)),
    ).toHaveLength(111);
    expect(
      catalog.entries.every(
        ({ boundaryProfile }) => boundaryProfile !== undefined,
      ),
    ).toBe(true);
    const requiredJson = catalog.entries.filter(
      ({ boundaryProfile }) =>
        boundaryProfile?.requestBody?.contentType === 'required',
    );
    expect(requiredJson).toHaveLength(20);
    expect(
      requiredJson.every(
        ({ boundaryProfile }) =>
          boundaryProfile?.requestBody?.unsupportedContentType?.code ===
            'unsupported_media_type' &&
          boundaryProfile.requestBody.unsupportedContentType.safeMessage ===
            'This endpoint requires a JSON request body.',
      ),
    ).toBe(true);
  });

  it('registers every concrete opaque provider and mounts the topology catalog once', () => {
    const owners = makeApiTargetOwnerFixture();
    const catalog = catalogFrom(owners);
    const runtime = runtimeFixture();
    const authentication = makeApiTargetAuthenticationProviders<
      Request,
      Response
    >({
      access: owners.systems.access,
      control: owners.experiences.control,
      processor: owners.experiences.processor,
      controlRealm: realm.control,
      processorRealm: realm.processor,
    });
    const providers = makeApiHttpBoundaryProviders<Request, Response>({
      owners,
      authentication,
      runtime,
      clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
      rateLimitStore: makeMemoryRateLimitStore(),
      centsWebhookVerifier: acceptUnsignedCentsWebhook,
      mechanisms: apiTestMechanisms,
    });
    const registry = makeApiHttpBoundaryProviderRegistry(providers.providers);
    assertApiHttpBoundaryProviderCoverage(catalog, registry);

    const mounted = mountHttpBoundaryCatalog({
      router: express.Router(),
      catalog,
      dependencies: makeApiHttpBoundaryHostDependencies(registry),
    });
    expect(mounted.routeCount).toBe(112);
    expect(sorted(Object.keys(registry.middleware))).toEqual(
      sorted(httpBoundaryProviderTokens.middleware),
    );
    expect(sorted(Object.keys(registry.context))).toEqual(
      sorted(httpBoundaryProviderTokens.context),
    );
    expect(sorted(Object.keys(registry.authorization))).toEqual(
      sorted(httpBoundaryProviderTokens.authorization),
    );
    expect(sorted(Object.keys(registry.expectedFailure))).toEqual(
      sorted(httpBoundaryProviderTokens.expectedFailure),
    );
  });

  it('resolves context providers sequentially in declaration order', async () => {
    const events: string[] = [];
    const base = makeApiBoundaryProviderFixture();
    const registry = makeApiHttpBoundaryProviderRegistry({
      ...base,
      context: {
        ...base.context,
        'request-metadata': async () => {
          events.push('metadata:start');
          await Promise.resolve();
          events.push('metadata:end');
          return { order: 1 };
        },
        'authenticated-principal': () => {
          events.push('principal');
          return { order: 2 };
        },
      },
    });
    const operation = {
      operationId: 'test.context-order.v1',
      observability: 'test.context_order',
      method: 'GET',
      path: '/test/context-order',
      bodyLimit: null,
      authentication: 'none',
      contextRequirements: [],
      authorization: null,
      boundaryProfileId: 'test-context-order-v1',
    } satisfies HttpBoundaryHostOperation;

    await expect(
      makeApiHttpBoundaryHostDependencies(registry).readCellContext({
        operation,
        providers: ['request-metadata', 'authenticated-principal'],
        request: {} as Request,
        response: {} as Response,
      }),
    ).resolves.toEqual({ order: 2 });
    expect(events).toEqual(['metadata:start', 'metadata:end', 'principal']);
  });

  it('keeps the atomic live order and no handwritten route authority', () => {
    const topologySource = readFileSync(
      resolve(repositoryRoot, 'topology/runtime/http/bootstrap/app.ts'),
      'utf8',
    );
    const hostSource = readFileSync(
      resolve(repositoryRoot, 'hosts/http/src/runtime/application.ts'),
      'utf8',
    );
    expect(topologySource.match(/makeApiTargetOwners\(/gu)).toHaveLength(1);
    expect(topologySource).not.toContain('app.use(');
    expect(topologySource).not.toContain('mountHttpBoundaryCatalog(');
    expect(hostSource).toContain('mountHttpBoundaryCatalog({');
    expect(hostSource).not.toMatch(
      /Cents|Orders|Production|Control|Processor/u,
    );
  });

  it('keeps the invariant-only invitation cookie-clear caveat in proof only', () => {
    expect({
      operations: [
        'control.accept-existing-invitation-password.v1',
        'control.accept-existing-invitation-mfa.v1',
      ],
      condition: 'loaded-bootstrap-session-has-no-session-id',
      acceptedCorrection:
        'revoke-session-then-throw-invariant-without-cookie-header',
      runtimeMechanism: 'none',
    }).toEqual({
      operations: [
        'control.accept-existing-invitation-password.v1',
        'control.accept-existing-invitation-mfa.v1',
      ],
      condition: 'loaded-bootstrap-session-has-no-session-id',
      acceptedCorrection:
        'revoke-session-then-throw-invariant-without-cookie-header',
      runtimeMechanism: 'none',
    });
  });
});
