import { acceptIncomingOrderProposalCellDeclaration } from '@pressly/orders-system/operations/intake/accept-incoming-order-proposal/cell';
import { cancelOrderCellDeclaration } from '@pressly/orders-system/operations/lifecycle/cancel-order/cell';
import { completeOrderCellDeclaration } from '@pressly/orders-system/operations/lifecycle/complete-order/cell';
import { correctOrderCellDeclaration } from '@pressly/orders-system/operations/lifecycle/correct-order/cell';
import { createOrderCellDeclaration } from '@pressly/orders-system/operations/lifecycle/create-order/cell';
import { getCanonicalOrderCellDeclaration } from '@pressly/orders-system/operations/queries/get-canonical-order/cell';
import { listCanonicalOrdersCellDeclaration } from '@pressly/orders-system/operations/queries/list-canonical-orders/cell';
import { listIncomingOrderProposalsCellDeclaration } from '@pressly/orders-system/operations/intake/list-incoming-order-proposals/cell';
import { orderManagementHttpBoundaryRequirements } from '@pressly/orders-system/testing/http-boundary';
import { rejectIncomingOrderProposalCellDeclaration } from '@pressly/orders-system/operations/intake/reject-incoming-order-proposal/cell';
import { releaseFulfillmentCellDeclaration } from '@pressly/orders-system/operations/fulfillment/release-fulfillment/cell';
import { restoreIncomingOrderProposalCellDeclaration } from '@pressly/orders-system/operations/intake/restore-incoming-order-proposal/cell';
import { withdrawFulfillmentCellDeclaration } from '@pressly/orders-system/operations/fulfillment/withdraw-fulfillment/cell';
import { describe, expect, it } from 'vitest';

type RequestFixture = Readonly<{
  params: Readonly<Record<string, string | undefined>>;
  query: unknown;
  headers: Readonly<Record<string, string | undefined>>;
  body: unknown;
  context: unknown;
}>;

type Surface = Readonly<{
  kind: 'http';
  method: string;
  path: string;
  bodyLimit: string | null;
  authorization: 'none' | 'staged';
  contextRequirements: readonly string[];
  validateRequest:
    | ((request: Omit<RequestFixture, 'context'>) => undefined)
    | null;
  decodeAuthorizationScope:
    | ((
        request: Pick<RequestFixture, 'params' | 'query' | 'headers'>,
      ) =>
        | Readonly<{ kind: 'valid'; value: string }>
        | Readonly<{ kind: 'invalid'; issues: readonly unknown[] }>)
    | null;
  toSerializedInput: (request: RequestFixture) => unknown;
  present: (outcome: unknown) => unknown;
}>;

type Declaration = Readonly<{
  id: string;
  authentication: string;
  authorization: Readonly<{ capability: string; timing: string }> | null;
  contract: Readonly<{
    input: Readonly<{ decode: (value: unknown) => Readonly<{ kind: string }> }>;
  }>;
  surfaces: readonly unknown[];
}>;

const locationId = 'orders-http-location';
const businessId = '76000000-0000-4000-8000-000000000001';
const orderId = '76000000-0000-4000-8000-000000000002';
const fulfillmentId = '76000000-0000-4000-8000-000000000003';
const proposalId = '76000000-0000-4000-8000-000000000004';
const context = {
  orderManagementBusinessId: businessId,
  orderManagementPrincipal: { identityId: 'identity-1', kind: 'human' },
};
const base = { query: {}, headers: {}, context } as const;
const mutation = {
  orderId,
  fulfillmentId,
  version: 2,
  replayed: false,
};
const listResult = {
  items: [
    {
      id: proposalId,
      version: 1,
      state: 'pending',
      source: 'cents',
      externalOrderId: 'source-order-1',
      locationId,
      displayNumber: 'P-100',
      customer: null,
      dueAt: new Date('2026-08-25T20:00:00.000Z'),
      estimatedWeightLbs: 18,
      sourceReportedAt: new Date('2026-08-22T18:00:00.000Z'),
      reportedAt: new Date('2026-08-22T18:01:00.000Z'),
      sourceClosure: null,
      availableActions: ['accept', 'reject'],
      acceptBlockedReason: null,
    },
  ],
  nextCursor: null,
};

const proposalBody = {
  expectedVersion: 1,
  idempotencyKey: 'proposal-command-1',
  reasonNote: null,
};
const auditedBody = {
  idempotencyKey: 'canonical-command-1',
  reasonNote: null,
};

const cases = [
  {
    declaration: listIncomingOrderProposalsCellDeclaration,
    method: 'GET',
    path: '/order-management/locations/:locationId/incoming-orders',
    status: 200,
    request: {
      ...base,
      params: { locationId },
      query: { limit: '25', view: 'needs_review' },
      body: undefined,
    },
    success: listResult,
    failure: {
      kind: 'validation',
      code: 'incoming_order_proposal_cursor_invalid',
      message: 'The incoming Order proposal cursor is invalid.',
    },
    failureStatus: 400,
    invalidLocation: 'query',
  },
  {
    declaration: acceptIncomingOrderProposalCellDeclaration,
    method: 'POST',
    path: '/order-management/locations/:locationId/incoming-orders/:proposalId/accept',
    status: 200,
    request: {
      ...base,
      params: { locationId, proposalId },
      body: { ...proposalBody, reasonCode: 'incoming_order_accepted' },
    },
    success: {
      proposalId,
      state: 'accepted',
      version: 2,
      orderId,
      fulfillmentId,
      replayed: false,
    },
    failure: {
      kind: 'not_found',
      code: 'incoming_order_proposal_not_found',
      message: 'The incoming Order proposal was not found.',
    },
    failureStatus: 404,
    invalidLocation: 'body',
  },
  {
    declaration: rejectIncomingOrderProposalCellDeclaration,
    method: 'POST',
    path: '/order-management/locations/:locationId/incoming-orders/:proposalId/reject',
    status: 200,
    request: {
      ...base,
      params: { locationId, proposalId },
      body: { ...proposalBody, reasonCode: 'duplicate_order' },
    },
    success: {
      proposalId,
      state: 'rejected',
      version: 2,
      orderId: null,
      fulfillmentId: null,
      replayed: false,
    },
    failure: {
      kind: 'conflict',
      code: 'incoming_order_proposal_transition_invalid',
      message: 'The incoming Order proposal has already been decided.',
    },
    failureStatus: 409,
    invalidLocation: 'body',
  },
  {
    declaration: restoreIncomingOrderProposalCellDeclaration,
    method: 'POST',
    path: '/order-management/locations/:locationId/incoming-orders/:proposalId/restore',
    status: 200,
    request: {
      ...base,
      params: { locationId, proposalId },
      body: { ...proposalBody, reasonCode: 'source_closure_overridden' },
    },
    success: {
      proposalId,
      state: 'restored_pending',
      version: 2,
      replayed: false,
    },
    failure: {
      kind: 'validation',
      code: 'incoming_order_proposal_restore_invalid',
      message: 'The incoming Order restore command is incomplete.',
    },
    failureStatus: 400,
    invalidLocation: 'body',
  },
  {
    declaration: createOrderCellDeclaration,
    method: 'POST',
    path: '/order-management/locations/:locationId/orders',
    status: 201,
    request: {
      ...base,
      params: { locationId },
      body: {
        ...auditedBody,
        reasonCode: 'new_customer_order',
        customer: { resolution: 'not_provided', userId: null },
        displayNumber: 'P-100',
        dueAt: '2026-08-25T20:00:00.000Z',
        currency: 'USD',
        totalAmountCents: 3_600,
        balanceDueCents: 3_600,
        items: [],
        fulfillment: {
          typeCode: 'wash_fold',
          locationId,
          estimatedWeightLbs: 18,
          estimatedWeightSource: 'source_estimate',
        },
      },
    },
    success: mutation,
    failure: {
      kind: 'not_found',
      code: 'order_reference_not_found',
      message: 'The selected customer or fulfillment location was not found.',
    },
    failureStatus: 404,
    invalidLocation: 'body',
  },
  {
    declaration: correctOrderCellDeclaration,
    method: 'PATCH',
    path: '/order-management/locations/:locationId/orders/:orderId',
    status: 200,
    request: {
      ...base,
      params: { locationId, orderId },
      body: {
        ...auditedBody,
        reasonCode: 'customer_correction',
        expectedOrderVersion: 1,
        expectedFulfillmentVersion: 1,
        changes: { displayNumber: 'P-101' },
      },
    },
    success: mutation,
    failure: {
      kind: 'conflict',
      code: 'order_version_conflict',
      message: 'The Order changed.',
    },
    failureStatus: 409,
    invalidLocation: 'body',
  },
  {
    declaration: completeOrderCellDeclaration,
    method: 'POST',
    path: '/order-management/locations/:locationId/orders/:orderId/complete',
    status: 200,
    request: {
      ...base,
      params: { locationId, orderId },
      body: {
        ...auditedBody,
        expectedVersion: 1,
        reasonCode: 'service_completed',
      },
    },
    success: mutation,
    failure: {
      kind: 'conflict',
      code: 'order_transition_invalid',
      message: 'The transition is invalid.',
    },
    failureStatus: 409,
    invalidLocation: 'body',
  },
  {
    declaration: cancelOrderCellDeclaration,
    method: 'POST',
    path: '/order-management/locations/:locationId/orders/:orderId/cancel',
    status: 200,
    request: {
      ...base,
      params: { locationId, orderId },
      body: {
        ...auditedBody,
        expectedVersion: 1,
        reasonCode: 'customer_canceled',
      },
    },
    success: mutation,
    failure: {
      kind: 'validation',
      code: 'order_lifecycle_command_invalid',
      message: 'The command is invalid.',
    },
    failureStatus: 400,
    invalidLocation: 'body',
  },
  {
    declaration: releaseFulfillmentCellDeclaration,
    method: 'POST',
    path: '/order-management/locations/:locationId/fulfillments/:fulfillmentId/release',
    status: 200,
    request: {
      ...base,
      params: { locationId, fulfillmentId },
      body: {
        ...auditedBody,
        expectedOrderVersion: 1,
        expectedFulfillmentVersion: 1,
        reasonCode: 'ready_for_production',
      },
    },
    success: mutation,
    failure: {
      kind: 'not_found',
      code: 'fulfillment_not_found',
      message: 'The fulfillment was not found.',
    },
    failureStatus: 404,
    invalidLocation: 'body',
  },
  {
    declaration: withdrawFulfillmentCellDeclaration,
    method: 'POST',
    path: '/order-management/locations/:locationId/fulfillments/:fulfillmentId/withdraw',
    status: 200,
    request: {
      ...base,
      params: { locationId, fulfillmentId },
      body: {
        ...auditedBody,
        expectedOrderVersion: 1,
        expectedFulfillmentVersion: 1,
        reasonCode: 'commercial_canceled',
      },
    },
    success: mutation,
    failure: {
      kind: 'conflict',
      code: 'fulfillment_transition_invalid',
      message: 'The transition is invalid.',
    },
    failureStatus: 409,
    invalidLocation: 'body',
  },
] as const;

const declaration = (value: unknown): Declaration => value as Declaration;
const surfaceFor = (value: unknown): Surface => {
  const surfaces = declaration(value).surfaces;
  expect(surfaces).toHaveLength(1);
  return surfaces[0] as Surface;
};

describe('Orders HTTP boundary parity map', () => {
  it('maps every exact route, method, limit, staged scope and context', () => {
    expect(cases).toHaveLength(10);
    for (const fixture of cases) {
      const cell = declaration(fixture.declaration);
      const surface = surfaceFor(cell);
      expect(cell.authentication).toBe('required');
      expect(cell.authorization?.capability).toBe('orders:manage');
      expect(surface).toMatchObject({
        kind: 'http',
        method: fixture.method,
        path: fixture.path,
        bodyLimit: '64kb',
        authorization: 'staged',
      });
      const requirement = orderManagementHttpBoundaryRequirements.find(
        (entry) => entry.operationId === cell.id,
      );
      expect(requirement).toBeDefined();
      expect(surface.contextRequirements).toEqual(
        requirement?.profile.contextProviders,
      );
      const decodedScope = surface.decodeAuthorizationScope?.({
        params: fixture.request.params,
        query: fixture.request.query,
        headers: fixture.request.headers,
      });
      expect(decodedScope).toEqual({ kind: 'valid', value: locationId });
    }
    expect(getCanonicalOrderCellDeclaration.surfaces).toEqual([]);
    expect(listCanonicalOrdersCellDeclaration.surfaces).toEqual([]);
  });

  it('maps every valid request into its strict cell contract', () => {
    for (const fixture of cases) {
      const cell = declaration(fixture.declaration);
      const surface = surfaceFor(cell);
      expect(
        cell.contract.input.decode(
          surface.toSerializedInput(fixture.request as RequestFixture),
        ),
      ).toMatchObject({ kind: 'valid' });
    }
  });

  it('rejects unknown query/body fields at every operation boundary', () => {
    for (const fixture of cases) {
      const surface = surfaceFor(fixture.declaration);
      const request = fixture.request as RequestFixture;
      const invalid = {
        params: request.params,
        query:
          fixture.invalidLocation === 'query'
            ? { ...(request.query as Record<string, unknown>), unknown: true }
            : request.query,
        headers: request.headers,
        body:
          fixture.invalidLocation === 'body'
            ? { ...(request.body as Record<string, unknown>), unknown: true }
            : request.body,
      };
      expect(() => surface.validateRequest?.(invalid)).toThrow(
        expect.objectContaining({
          code: `invalid_${fixture.invalidLocation}_type`,
          status: 400,
          publicDetails: expect.objectContaining({
            location: fixture.invalidLocation,
          }),
        }),
      );
    }
  });

  it('maps every success status and exact success envelope', () => {
    for (const fixture of cases) {
      const surface = surfaceFor(fixture.declaration);
      const response = surface.present({
        kind: 'success',
        value: fixture.success,
      }) as Readonly<{ status: number; body: unknown }>;
      expect(response.status).toBe(fixture.status);
      expect(response.body).toMatchObject({
        ok: true,
        data: expect.anything(),
      });
    }
    const list = surfaceFor(listIncomingOrderProposalsCellDeclaration).present({
      kind: 'success',
      value: listResult,
    }) as Readonly<{
      body: { data: { items: readonly Record<string, unknown>[] } };
    }>;
    expect(list.body.data.items[0]).toMatchObject({
      dueAt: '2026-08-25T20:00:00.000Z',
      sourceReportedAt: '2026-08-22T18:00:00.000Z',
      reportedAt: '2026-08-22T18:01:00.000Z',
    });
  });

  it('maps every expected failure to the current public status for central observation', () => {
    for (const fixture of cases) {
      const surface = surfaceFor(fixture.declaration);
      try {
        surface.present({ kind: 'failure', failure: fixture.failure });
        expect.unreachable('Expected failure presentation must throw.');
      } catch (error) {
        expect(error).toMatchObject({
          code: fixture.failure.code,
          safeMessage: fixture.failure.message,
          status: fixture.failureStatus,
        });
        const observed = error as Readonly<{
          code: string;
          safeMessage: string;
        }>;
        expect({
          ok: false,
          error: {
            code: observed.code,
            message: observed.safeMessage,
            traceId: 'request-trace-1',
          },
        }).toEqual({
          ok: false,
          error: {
            code: fixture.failure.code,
            message: fixture.failure.message,
            traceId: 'request-trace-1',
          },
        });
      }
    }
  });

  it('maps every operation to its selected HTTP boundary profile', () => {
    expect(orderManagementHttpBoundaryRequirements).toHaveLength(10);
    for (const [index, fixture] of cases.entries()) {
      const requirement = orderManagementHttpBoundaryRequirements[index];
      expect(requirement).toBeDefined();
      expect(requirement).toMatchObject({
        operationId: declaration(fixture.declaration).id,
      });
      expect(requirement?.profile.requestRateLimit).toBeNull();
      expect(requirement?.profile.authentication).toEqual({
        provider: 'processor-cookie-or-bearer-session',
        required: true,
      });
      expect(requirement?.profile.requestBody).toMatchObject({
        acceptedContentTypes: ['application/json'],
        contentType: 'parse-if-matching',
        parser: 'json-document',
        phase: 'before-authentication',
      });
      expect(requirement?.profile.expectedFailureObservation).toBe(
        'central-api-error-observation',
      );
    }
  });

  it('preserves create location mismatch before context decoding', () => {
    const surface = surfaceFor(createOrderCellDeclaration);
    const fixture = cases.find(
      (entry) => entry.declaration === createOrderCellDeclaration,
    );
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;
    expect(() =>
      surface.validateRequest?.({
        params: { locationId: 'another-location' },
        query: {},
        headers: {},
        body: fixture.request.body,
      }),
    ).toThrow(
      expect.objectContaining({ code: 'order_location_mismatch', status: 422 }),
    );
  });
});
