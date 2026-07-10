import type { Principal } from '@pressly/auth/authentication';
import type {
  Action,
  AuthResource,
  PolicyRule,
} from '@pressly/auth/authorization';
import type { Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { makePricingAccessControl } from '../../src/pricing/pricing.guards.ts';
import type { AccessControlAuthorize } from '../../src/auth.port.ts';

const principal: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Admin User',
};

type RecordedAuthorizeInput = Readonly<{
  action: Action;
  policies: readonly unknown[];
  readResource: (req: Request, res: Response) => AuthResource;
}>;

const makeAuthorizeFake = (
  handlers: readonly RequestHandler[],
): Readonly<{
  authorize: AccessControlAuthorize;
  calls: RecordedAuthorizeInput[];
}> => {
  const calls: RecordedAuthorizeInput[] = [];

  return {
    calls,
    authorize: <R extends AuthResource>(input: {
      action: Action;
      policies: readonly PolicyRule<R>[];
      readResource: (req: Request, res: Response) => R;
    }): RequestHandler => {
      const handler = handlers[calls.length];

      if (handler === undefined) throw new Error('Unexpected authorize call.');

      calls.push(input as RecordedAuthorizeInput);

      return handler;
    },
  };
};

describe('pricing access-control guards', () => {
  it('builds concrete pricing authorization handlers', () => {
    const authenticate = vi.fn() as unknown as RequestHandler;
    const planHandler = vi.fn() as unknown as RequestHandler;
    const publishHandler = vi.fn() as unknown as RequestHandler;

    const { authorize, calls } = makeAuthorizeFake([
      planHandler,
      publishHandler,
    ]);

    const accessControl = makePricingAccessControl({
      auth: { authenticate, authorize, readPrincipal: vi.fn(() => principal) },
      policies: { freshSessionMaxAgeMinutes: 20 },
    });

    expect(accessControl.authenticate).toBe(authenticate);
    expect(accessControl.planPricingChange).toBe(planHandler);
    expect(accessControl.publishPricingChange).toBe(publishHandler);
    expect(calls).toEqual([
      expect.objectContaining({
        action: 'pricing:plan',
        policies: expect.any(Array),
        readResource: expect.any(Function),
      }),
      expect.objectContaining({
        action: 'pricing:publish',
        policies: expect.any(Array),
        readResource: expect.any(Function),
      }),
    ]);
  });

  it('reads pricing resources from validated request bodies', () => {
    const { authorize, calls } = makeAuthorizeFake([
      vi.fn() as unknown as RequestHandler,
      vi.fn() as unknown as RequestHandler,
    ]);

    makePricingAccessControl({
      auth: {
        authenticate: vi.fn() as unknown as RequestHandler,
        authorize,
        readPrincipal: vi.fn(() => principal),
      },
      policies: { freshSessionMaxAgeMinutes: 15 },
    });

    const planInput = calls[0];
    const resource = planInput?.readResource(
      {
        body: {
          serviceSlug: 'wash-fold',
          reason: 'Update delivery fee',
          items: [{ code: 'delivery_fee', priceCents: 100 }],
        },
      } as Request,
      { locals: {} } as Response,
    );

    expect(resource).toEqual({
      kind: 'pricing.catalog',
      id: 'pricing:wash-fold:global',
      scope: { kind: 'global', id: '*' },
      attributes: {
        serviceSlug: 'wash-fold',
      },
    });
  });

  it('maps authenticated principals to pricing change authors', () => {
    const { authorize } = makeAuthorizeFake([
      vi.fn() as unknown as RequestHandler,
      vi.fn() as unknown as RequestHandler,
    ]);
    const accessControl = makePricingAccessControl({
      auth: {
        authenticate: vi.fn() as unknown as RequestHandler,
        authorize,
        readPrincipal: vi.fn(() => principal),
      },
      policies: { freshSessionMaxAgeMinutes: 15 },
    });

    expect(
      accessControl.readAuthor({
        locals: {
          auth: {
            principal,
          },
        },
      } as unknown as Response),
    ).toEqual({
      id: principal.identityId,
      kind: principal.kind,
      displayName: principal.displayName,
    });
  });

  it('rejects author reads without an authenticated principal', () => {
    const { authorize } = makeAuthorizeFake([
      vi.fn() as unknown as RequestHandler,
      vi.fn() as unknown as RequestHandler,
    ]);
    const accessControl = makePricingAccessControl({
      auth: {
        authenticate: vi.fn() as unknown as RequestHandler,
        authorize,
        readPrincipal: vi.fn(() => {
          throw Object.assign(new Error('missing auth principal'), {
            code: 'missing_auth_principal',
          });
        }),
      },
      policies: { freshSessionMaxAgeMinutes: 15 },
    });

    expect(() =>
      accessControl.readAuthor({ locals: {} } as unknown as Response),
    ).toThrow(expect.objectContaining({ code: 'missing_auth_principal' }));
  });
});
