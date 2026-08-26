import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  defineOperation,
  defineHttpCatalog,
  type CellDeclaration,
  type CellOutcome,
  type FiniteCellKind,
} from '@pressly/cells';
import {
  controlAuthBoundaryProfiles,
  controlCliAuthApiBoundaryProfiles,
} from '@pressly/experience-control/testing/auth-boundaries';
import {
  controlAuthCellDeclarations,
  controlCliAuthApiCellDeclarations,
  controlManagementCellDeclarations,
} from '@pressly/experience-control/testing/assembly';
import { controlManagementBoundaryProfiles } from '@pressly/experience-control/testing/management-boundaries';
import { customerAuthBoundaryProfiles } from '@pressly/experience-customer/testing/auth-boundaries';
import { customerAuthCellDeclarations } from '@pressly/experience-customer/testing/assembly';
import {
  processorAuthBoundaryProfiles,
  processorAuthenticationCellDeclarations,
} from '@pressly/experience-processor/server';
import {
  mountHttpBoundaryCatalog,
  type HttpBoundaryHostDependencies,
} from '@pressly/http-host';
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it } from 'vitest';

const inertCell = <Kind extends FiniteCellKind, Input, Output, Failure>(
  declaration: CellDeclaration<Kind, Input, Output, Failure>,
) =>
  defineOperation(
    declaration,
    async (_input): Promise<CellOutcome<Output, Failure>> =>
      new Promise<CellOutcome<Output, Failure>>(() => undefined),
  );

const customerCells = [
  inertCell(customerAuthCellDeclarations.login),
  inertCell(customerAuthCellDeclarations.loadSession),
  inertCell(customerAuthCellDeclarations.logout),
  inertCell(customerAuthCellDeclarations.completeMfaChallenge),
  inertCell(customerAuthCellDeclarations.listIdentitySessions),
  inertCell(customerAuthCellDeclarations.revokeAllIdentitySessions),
  inertCell(customerAuthCellDeclarations.revokeIdentitySession),
  inertCell(customerAuthCellDeclarations.beginMfaEnrollment),
  inertCell(customerAuthCellDeclarations.confirmMfaEnrollment),
  inertCell(customerAuthCellDeclarations.regenerateMfaRecoveryCodes),
  inertCell(customerAuthCellDeclarations.removeMfa),
] as const;
const controlCells = [
  inertCell(controlAuthCellDeclarations.login),
  inertCell(controlAuthCellDeclarations.completeMfaChallenge),
  inertCell(controlAuthCellDeclarations.loadSession),
  inertCell(controlAuthCellDeclarations.logout),
  inertCell(controlAuthCellDeclarations.listIdentitySessions),
  inertCell(controlAuthCellDeclarations.revokeAllIdentitySessions),
  inertCell(controlAuthCellDeclarations.revokeIdentitySession),
  inertCell(controlAuthCellDeclarations.beginMfaEnrollment),
  inertCell(controlAuthCellDeclarations.confirmMfaEnrollment),
  inertCell(controlAuthCellDeclarations.regenerateMfaRecoveryCodes),
  inertCell(controlAuthCellDeclarations.removeMfa),
] as const;
const controlCliAuthApiCells = [
  inertCell(controlCliAuthApiCellDeclarations.cliAuthApiLogin),
  inertCell(controlCliAuthApiCellDeclarations.cliAuthApiCompleteMfaChallenge),
  inertCell(controlCliAuthApiCellDeclarations.cliAuthApiLoadSession),
  inertCell(controlCliAuthApiCellDeclarations.cliAuthApiLogout),
  inertCell(controlCliAuthApiCellDeclarations.cliAuthApiBeginMfaEnrollment),
  inertCell(controlCliAuthApiCellDeclarations.cliAuthApiConfirmMfaEnrollment),
  inertCell(
    controlCliAuthApiCellDeclarations.cliAuthApiRegenerateMfaRecoveryCodes,
  ),
  inertCell(controlCliAuthApiCellDeclarations.cliAuthApiRemoveMfa),
] as const;
const controlManagementCells = [
  inertCell(controlManagementCellDeclarations.listCustomers),
  inertCell(controlManagementCellDeclarations.getCustomer),
  inertCell(controlManagementCellDeclarations.createCustomer),
  inertCell(controlManagementCellDeclarations.updateCustomer),
  inertCell(controlManagementCellDeclarations.listOrders),
  inertCell(controlManagementCellDeclarations.getOrder),
  inertCell(controlManagementCellDeclarations.createOrder),
  inertCell(controlManagementCellDeclarations.correctOrder),
  inertCell(controlManagementCellDeclarations.listMembers),
  inertCell(controlManagementCellDeclarations.getMember),
  inertCell(controlManagementCellDeclarations.listMemberSessions),
  inertCell(controlManagementCellDeclarations.revokeMemberSessions),
  inertCell(controlManagementCellDeclarations.listInvitations),
  inertCell(controlManagementCellDeclarations.issueInvitation),
  inertCell(controlManagementCellDeclarations.reissueInvitation),
  inertCell(controlManagementCellDeclarations.revokeInvitation),
  inertCell(controlManagementCellDeclarations.suspendMembership),
  inertCell(controlManagementCellDeclarations.reactivateMembership),
  inertCell(controlManagementCellDeclarations.endMembership),
  inertCell(controlManagementCellDeclarations.grantAccess),
  inertCell(controlManagementCellDeclarations.revokeAccess),
  inertCell(controlManagementCellDeclarations.listSecurityEvents),
  inertCell(controlManagementCellDeclarations.previewInvitation),
  inertCell(controlManagementCellDeclarations.acceptNewInvitation),
  inertCell(controlManagementCellDeclarations.acceptExistingInvitationPassword),
  inertCell(controlManagementCellDeclarations.acceptExistingInvitationMfa),
  inertCell(controlManagementCellDeclarations.acceptExistingInvitation),
] as const;
const processorCells = [
  inertCell(processorAuthenticationCellDeclarations.login),
  inertCell(processorAuthenticationCellDeclarations.completeMfaChallenge),
  inertCell(processorAuthenticationCellDeclarations.loadSession),
  inertCell(processorAuthenticationCellDeclarations.logout),
] as const;

const noOp: RequestHandler = (_request, _response, next) => next();
const mountingDependencies: HttpBoundaryHostDependencies = {
  requestContext: () => noOp,
  middleware: () => noOp,
  readCellContext: () => ({}),
  authorize: () => undefined,
  observeExpectedFailure: () => undefined,
};

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) =>
              error === undefined ? resolve() : reject(error),
            ),
          ),
      ),
  );
});

const listen = async (app: Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${String(address.port)}`;
};

const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  const candidate = error as Readonly<{
    code?: unknown;
    safeMessage?: unknown;
    status?: unknown;
  }>;
  response.status(
    typeof candidate.status === 'number' ? candidate.status : 500,
  );
  response.json({
    ok: false,
    error: {
      code:
        typeof candidate.code === 'string' ? candidate.code : 'test_failure',
      message:
        typeof candidate.safeMessage === 'string'
          ? candidate.safeMessage
          : 'The test request failed.',
    },
  });
};

describe('selected profiled-host protocol', () => {
  it('keeps Control CLI auth in a no-store bearer realm with layered throttling and no cookie defenses', () => {
    for (const operationId of [
      'control.cli-auth-api-begin-mfa-enrollment.v1',
      'control.cli-auth-api-confirm-mfa-enrollment.v1',
      'control.cli-auth-api-regenerate-mfa-recovery-codes.v1',
      'control.cli-auth-api-remove-mfa.v1',
    ])
      expect(controlCliAuthApiBoundaryProfiles[operationId]).toMatchObject({
        authentication: {
          provider: 'control-bearer-session',
          required: true,
        },
        exactOrigin: null,
        csrf: null,
        requestRateLimit: 'control-boundary',
        identityRateLimit: 'control-identity',
        noStore: true,
        authorization: 'access-policy',
      });

    for (const operationId of [
      'control.cli-auth-api-login.v1',
      'control.cli-auth-api-complete-mfa-challenge.v1',
      'control.cli-auth-api-load-session.v1',
      'control.cli-auth-api-logout.v1',
    ])
      expect(controlCliAuthApiBoundaryProfiles[operationId]).toMatchObject({
        authentication: null,
        exactOrigin: null,
        csrf: null,
        noStore: true,
      });
  });

  it('constructs all 61 declared authentication and Control administration routes', () => {
    const app = express();
    expect(
      mountHttpBoundaryCatalog({
        router: app,
        catalog: defineHttpCatalog(customerCells, customerAuthBoundaryProfiles),
        dependencies: mountingDependencies,
      }).routeCount,
    ).toBe(11);
    expect(
      mountHttpBoundaryCatalog({
        router: app,
        catalog: defineHttpCatalog(
          controlCliAuthApiCells,
          controlCliAuthApiBoundaryProfiles,
        ),
        dependencies: mountingDependencies,
      }).routeCount,
    ).toBe(8);
    expect(
      mountHttpBoundaryCatalog({
        router: app,
        catalog: defineHttpCatalog(controlCells, controlAuthBoundaryProfiles),
        dependencies: mountingDependencies,
      }).routeCount,
    ).toBe(11);
    expect(
      mountHttpBoundaryCatalog({
        router: app,
        catalog: defineHttpCatalog(
          processorCells,
          processorAuthBoundaryProfiles,
        ),
        dependencies: mountingDependencies,
      }).routeCount,
    ).toBe(4);
    expect(
      mountHttpBoundaryCatalog({
        router: app,
        catalog: defineHttpCatalog(
          controlManagementCells,
          controlManagementBoundaryProfiles,
        ),
        dependencies: mountingDependencies,
      }).routeCount,
    ).toBe(27);
  });

  it('executes a protected Control CLI auth route through bearer, IP, identity, and policy boundaries without cookie defenses', async () => {
    const events: string[] = [];
    const beginEnrollment = defineOperation(
      controlCliAuthApiCellDeclarations.cliAuthApiBeginMfaEnrollment,
      async () => ({
        kind: 'success',
        value: {
          secret: 'a'.repeat(32),
          enrollmentUri: 'otpauth://totp/Pressly:Owner',
        },
      }),
    );
    const app = express();
    mountHttpBoundaryCatalog({
      router: app,
      catalog: defineHttpCatalog(
        [beginEnrollment],
        controlCliAuthApiBoundaryProfiles,
      ),
      dependencies: {
        requestContext: () => (_request, _response, next) => {
          events.push('request-context');
          next();
        },
        middleware: (input) => {
          if (input.kind === 'request-body-parser')
            return express.json({ limit: input.limit ?? undefined });
          return (_request, _response, next) => {
            events.push(`${input.kind}:${input.provider}`);
            next();
          };
        },
        readCellContext: () => ({
          principal: {
            identityId: '11111111-1111-4111-8111-111111111111',
            sessionId: '22222222-2222-4222-8222-222222222222',
            label: 'Owner',
          },
          requestMetadata: { requestId: 'cli-auth-boundary-request' },
        }),
        authorize: async (input) => {
          events.push(`authorization:${input.provider}:${input.capability}`);
        },
        observeExpectedFailure: () => undefined,
      },
    });
    app.use(errorHandler);
    const origin = await listen(app);
    const response = await fetch(`${origin}/control/cli/auth/mfa/enrollment`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer control-cli-token',
        cookie: 'pressly_control_session=ambient-cookie',
        origin: 'https://untrusted-origin.test',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(events).toEqual([
      'request-context',
      'request-rate-limit:control-boundary',
      'authentication:control-bearer-session',
      'identity-rate-limit:control-identity',
      'authorization:access-policy:auth:mfa:enroll',
    ]);
  });

  it('executes request-rate, parser, origin, validation and multi-cookie presentation in order', async () => {
    const events: string[] = [];
    const login = defineOperation(
      controlAuthCellDeclarations.login,
      async () => {
        events.push('execute');
        const methods: ['totp', 'recovery'] = ['totp', 'recovery'];
        return {
          kind: 'success',
          value: {
            data: {
              status: 'mfa_required' as const,
              methods,
            },
            setCookieHeaders: [
              'pressly_control_session=; Path=/; HttpOnly; SameSite=Strict',
              'pressly_control_mfa=challenge; Path=/; HttpOnly; SameSite=Strict',
            ],
          },
        };
      },
    );
    const app = express();
    const dependencies: HttpBoundaryHostDependencies = {
      requestContext: () => (_request, _response, next) => {
        events.push('request-context');
        next();
      },
      middleware: (input) => {
        if (input.kind === 'request-body-parser') {
          const parser = express.json({ limit: input.limit ?? undefined });
          return (request, response, next) => {
            events.push(`parser:${input.provider}`);
            parser(request, response, next);
          };
        }
        return (request, _response, next) => {
          events.push(`${input.kind}:${input.provider}`);
          if (
            input.kind === 'exact-origin' &&
            request.header('origin') !== 'https://control.test'
          ) {
            next({
              code: 'control_origin_rejected',
              safeMessage: 'This Control request was rejected.',
              status: 403,
            });
            return;
          }
          next();
        };
      },
      readCellContext: () => {
        events.push('read-context');
        return { requestMetadata: { requestId: 'request-1' } };
      },
      authorize: () => undefined,
      observeExpectedFailure: () => undefined,
    };
    mountHttpBoundaryCatalog({
      router: app,
      catalog: defineHttpCatalog([login], controlAuthBoundaryProfiles),
      dependencies,
    });
    app.use(errorHandler);
    const origin = await listen(app);
    const response = await fetch(`${origin}/control/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://control.test',
      },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'correct-horse-battery-staple',
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.getSetCookie()).toEqual([
      'pressly_control_session=; Path=/; HttpOnly; SameSite=Strict',
      'pressly_control_mfa=challenge; Path=/; HttpOnly; SameSite=Strict',
    ]);
    expect(await response.json()).toEqual({
      ok: true,
      data: { status: 'mfa_required', methods: ['totp', 'recovery'] },
    });
    expect(events).toEqual([
      'request-context',
      'request-rate-limit:control-auth-login-rate-chain',
      'parser:json-document',
      'exact-origin:control-exact-origin',
      'read-context',
      'execute',
    ]);
  });

  it('keeps Control schema validation after exact-origin for public login', async () => {
    const events: string[] = [];
    const login = inertCell(controlAuthCellDeclarations.login);
    const app = express();
    mountHttpBoundaryCatalog({
      router: app,
      catalog: defineHttpCatalog([login], controlAuthBoundaryProfiles),
      dependencies: {
        requestContext: () => noOp,
        middleware: (input) => {
          if (input.kind === 'request-body-parser')
            return express.json({ limit: input.limit ?? undefined });
          return (request, _response, next) => {
            events.push(input.kind);
            if (
              input.kind === 'exact-origin' &&
              request.header('origin') !== 'https://control.test'
            ) {
              next({
                code: 'control_origin_rejected',
                safeMessage: 'This Control request was rejected.',
                status: 403,
              });
              return;
            }
            next();
          };
        },
        readCellContext: () => ({}),
        authorize: () => undefined,
        observeExpectedFailure: () => undefined,
      },
    });
    app.use(errorHandler);
    const origin = await listen(app);
    const response = await fetch(`${origin}/control/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'too-short' }),
    });
    expect(response.status).toBe(403);
    expect(events).toContain('exact-origin');
  });

  it('preserves cookie-clearing failure wire data', () => {
    const controlSurface = controlAuthCellDeclarations.loadSession.surfaces[0];
    expect(controlSurface?.kind).toBe('http');
    if (controlSurface?.kind !== 'http') return;

    expect(
      controlSurface.present({
        kind: 'failure',
        failure: {
          kind: 'authentication',
          code: 'invalid_session',
          message: 'Authentication is required.',
          safeMessage: 'Authentication is required.',
          traceId: 'request-1',
          setCookieHeaders: [
            'pressly_control_session=; Path=/; HttpOnly; SameSite=Strict',
          ],
        },
      }),
    ).toEqual({
      status: 401,
      headers: {
        Pragma: 'no-cache',
        Vary: 'Origin',
        'Set-Cookie': [
          'pressly_control_session=; Path=/; HttpOnly; SameSite=Strict',
        ],
      },
      body: {
        ok: false,
        error: {
          code: 'invalid_session',
          message: 'Authentication is required.',
          traceId: 'request-1',
        },
      },
    });
  });

  it('skips ambient JSON parsing and observes a cookie failure exactly once before send', async () => {
    const events: string[] = [];
    const loadSession = defineOperation(
      controlAuthCellDeclarations.loadSession,
      async () => ({
        kind: 'failure',
        failure: {
          kind: 'authentication' as const,
          code: 'invalid_session',
          message: 'Authentication is required.',
          safeMessage: 'Authentication is required.',
          traceId: 'request-conditional',
          setCookieHeaders: [
            'pressly_control_session=; Path=/; HttpOnly; SameSite=Strict',
          ],
        },
      }),
    );
    const app = express();
    mountHttpBoundaryCatalog({
      router: app,
      catalog: defineHttpCatalog([loadSession], controlAuthBoundaryProfiles),
      dependencies: {
        requestContext: () => noOp,
        middleware: (input) => {
          if (input.kind === 'request-body-parser')
            return (_request, _response, next) => {
              events.push('parser');
              next();
            };
          return noOp;
        },
        readCellContext: () => ({
          sessionToken: 'invalid-session',
          requestMetadata: { requestId: 'request-conditional' },
        }),
        authorize: () => undefined,
        observeExpectedFailure: (input) => {
          events.push(`observe:${input.provider}:${String(input.status)}`);
          expect(input.response.headersSent).toBe(false);
          expect(input.failure).toMatchObject({ code: 'invalid_session' });
        },
      },
    });
    app.use(errorHandler);
    const origin = await listen(app);
    const response = await fetch(`${origin}/control/auth/session`, {
      headers: { 'content-type': 'text/plain' },
    });
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([
      'pressly_control_session=; Path=/; HttpOnly; SameSite=Strict',
    ]);
    expect(events).toEqual(['observe:cookie-auth-failure:401']);
  });

  it('runs a protected bodyless Control administration route without parsing non-JSON', async () => {
    const events: string[] = [];
    const listCustomers = defineOperation(
      controlManagementCellDeclarations.listCustomers,
      async () => ({
        kind: 'success',
        value: { items: [], nextCursor: null },
      }),
    );
    const app = express();
    mountHttpBoundaryCatalog({
      router: app,
      catalog: defineHttpCatalog(
        [listCustomers],
        controlManagementBoundaryProfiles,
      ),
      dependencies: {
        requestContext: () => noOp,
        middleware: (input) => {
          if (input.kind === 'request-body-parser')
            return (_request, _response, next) => {
              events.push('parser');
              next();
            };
          return (_request, _response, next) => {
            events.push(input.kind);
            next();
          };
        },
        readCellContext: () => ({
          access: {
            business: {
              id: '11111111-1111-4111-8111-111111111111',
              name: 'Pressly Laundry',
            },
            locations: [],
            selectedLocationId: null,
            capabilities: ['control:view', 'customers:read'],
            applications: [],
          },
          actor: {
            identityId: '22222222-2222-4222-8222-222222222222',
            sessionId: '33333333-3333-4333-8333-333333333333',
          },
          command: {
            origin: 'pressly_control',
            principal: {
              kind: 'human',
              id: '22222222-2222-4222-8222-222222222222',
            },
          },
        }),
        authorize: () => {
          events.push('authorize');
        },
      },
    });
    app.use(errorHandler);
    const origin = await listen(app);
    const response = await fetch(`${origin}/control/customers`, {
      headers: { 'content-type': 'text/plain' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBeNull();
    expect(await response.json()).toEqual({
      ok: true,
      data: { items: [], nextCursor: null },
    });
    expect(events).not.toContain('parser');
    expect(events).toEqual([
      'request-rate-limit',
      'authentication',
      'identity-rate-limit',
      'authorize',
    ]);
  });

  it('observes invitation bootstrap cookie failures once without forcing no-store', async () => {
    const events: string[] = [];
    const password = defineOperation(
      controlManagementCellDeclarations.acceptExistingInvitationPassword,
      async () => ({
        kind: 'failure',
        failure: {
          kind: 'authentication' as const,
          code: 'invalid_session',
          message: 'The bootstrap session is invalid.',
          safeMessage: 'Authentication is required.',
          setCookieHeaders: [
            'pressly_control_session=; Path=/; HttpOnly; SameSite=Strict',
          ],
        },
      }),
    );
    const app = express();
    mountHttpBoundaryCatalog({
      router: app,
      catalog: defineHttpCatalog([password], controlManagementBoundaryProfiles),
      dependencies: {
        requestContext: () => noOp,
        middleware: (input) => {
          if (input.kind === 'request-body-parser')
            return express.json({ limit: input.limit ?? undefined });
          return noOp;
        },
        readCellContext: () => ({ requestMetadata: {} }),
        authorize: () => undefined,
        observeExpectedFailure: (input) => {
          events.push(`${input.provider}:${String(input.status)}`);
          expect(input.failure).toMatchObject({ code: 'invalid_session' });
        },
      },
    });
    app.use(errorHandler);
    const origin = await listen(app);
    const response = await fetch(
      `${origin}/control/invitations/accept/existing/password`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://control.pressly.test',
        },
        body: JSON.stringify({
          acceptanceToken: 't'.repeat(40),
          idempotencyKey: 'acceptance-key',
          password: 'correct-horse-battery-staple',
        }),
      },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([
      'pressly_control_session=; Path=/; HttpOnly; SameSite=Strict',
    ]);
    expect(events).toEqual(['cookie-auth-failure:401']);
  });

  it('validates invitation MFA input before reporting its missing challenge cookie', async () => {
    const mfa = inertCell(
      controlManagementCellDeclarations.acceptExistingInvitationMfa,
    );
    const app = express();
    mountHttpBoundaryCatalog({
      router: app,
      catalog: defineHttpCatalog([mfa], controlManagementBoundaryProfiles),
      dependencies: {
        requestContext: () => noOp,
        middleware: (input) =>
          input.kind === 'request-body-parser'
            ? express.json({ limit: input.limit ?? undefined })
            : noOp,
        readCellContext: () => ({ requestMetadata: {} }),
        authorize: () => undefined,
        observeExpectedFailure: () => undefined,
      },
    });
    app.use(errorHandler);
    const origin = await listen(app);
    const request = (body: unknown) =>
      fetch(`${origin}/control/invitations/accept/existing/mfa`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://control.pressly.test',
        },
        body: JSON.stringify(body),
      });

    const malformed = await request({ method: 'totp', code: 'bad' });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: 'invalid_body_type' },
    });

    const missingChallenge = await request({
      method: 'totp',
      code: '123456',
      acceptanceToken: 't'.repeat(40),
      idempotencyKey: 'acceptance-key',
    });
    expect(missingChallenge.status).toBe(401);
    await expect(missingChallenge.json()).resolves.toMatchObject({
      error: { code: 'invitation_mfa_challenge_missing' },
    });
  });
});
