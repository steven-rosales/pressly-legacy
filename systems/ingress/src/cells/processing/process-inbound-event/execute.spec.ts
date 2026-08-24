import { databaseError } from '@pressly/errors/factories';
import type { CentsSubmittedOrderCandidatePayload } from '../../../contracts/cents-v1.ts';
import type { WebhookEventReadyV1 } from '../../../contracts/webhook-event-ready-v1.ts';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteProcessInboundEvent } from './execute.ts';
import type {
  CloseIncomingOrderSourceCapability,
  ProcessInboundEventDependencies,
  ProposeIncomingOrderCapability,
  ResolveSourceClosedFulfillmentCapability,
  ResolveSourceLocationCapability,
} from './types.ts';

const submitted = (): CentsSubmittedOrderCandidatePayload => ({
  externalOrderId: 'order-1',
  orderCode: '00123',
  externalStoreId: 'store-1',
  status: 'SUBMITTED',
  dueAt: '2026-07-10T20:00:00.000Z',
  sourceUpdatedAt: '2026-07-10T13:00:00.000Z',
  bagCount: null,
  totalAmountCents: 14_800,
  balanceDueCents: 14_800,
  services: [
    {
      externalServiceId: 'wash-fold',
      name: 'Wash and fold',
      category: 'LAUNDRY',
      quantity: 1,
      totalPriceCents: 14_800,
      unitPriceCents: 200,
    },
  ],
  customer: null,
});

const terminal = (status: 'CANCELED' | 'COMPLETED') => ({
  externalOrderId: 'order-1',
  externalStoreId: 'store-1',
  status,
  sourceUpdatedAt: '2026-07-10T13:00:00.000Z',
});

const event = (
  overrides: Partial<WebhookEventReadyV1> = {},
): WebhookEventReadyV1 => ({
  eventId: '83000000-0000-4000-8000-000000000001',
  source: 'cents',
  eventType: 'order_updated',
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: new Date('2026-07-10T13:00:00.000Z'),
  receivedAt: new Date('2026-07-10T13:00:01.000Z'),
  payloadHash: 'a'.repeat(64),
  payload: submitted(),
  ...overrides,
});

const setup = (overrides: Partial<ProcessInboundEventDependencies> = {}) => {
  const deps: ProcessInboundEventDependencies = {
    resolveSourceLocation:
      overrides.resolveSourceLocation ??
      vi.fn<ResolveSourceLocationCapability>(async () => ({
        kind: 'success',
        value: 'location-1',
      })),
    proposeIncomingOrder:
      overrides.proposeIncomingOrder ??
      vi.fn<ProposeIncomingOrderCapability>(async () => ({
        kind: 'success',
        value: { outcome: 'proposed' },
      })),
    closeIncomingOrderSource:
      overrides.closeIncomingOrderSource ??
      vi.fn<CloseIncomingOrderSourceCapability>(async () => ({
        kind: 'success',
        value: { canonical: null },
      })),
    resolveSourceClosedFulfillment:
      overrides.resolveSourceClosedFulfillment ??
      vi.fn<ResolveSourceClosedFulfillmentCapability>(async () => ({
        kind: 'success',
        value: { outcome: 'already_resolved' },
      })),
  };
  return { deps, execute: makeExecuteProcessInboundEvent(deps) };
};

const acknowledged = {
  kind: 'success',
  value: { acknowledged: true },
} as const;

describe('process-inbound-event execution', () => {
  it.each(['customer', 'marketing'] as const)(
    'acknowledges queued Cents %s without invoking canonical capabilities',
    async (subjectType) => {
      const { deps, execute } = setup();
      await expect(execute(event({ subjectType }))).resolves.toEqual(
        acknowledged,
      );
      expect(deps.resolveSourceLocation).not.toHaveBeenCalled();
      expect(deps.proposeIncomingOrder).not.toHaveBeenCalled();
      expect(deps.closeIncomingOrderSource).not.toHaveBeenCalled();
      expect(deps.resolveSourceClosedFulfillment).not.toHaveBeenCalled();
    },
  );

  it('returns a permanent missing-consumer failure for another source/subject', async () => {
    const { execute } = setup();
    await expect(execute(event({ source: 'unknown' }))).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'validation',
        classification: 'missing_consumer',
        code: 'webhook_event_consumer_missing',
        message: 'No consumer is registered for unknown:order.',
        safeMessage: 'No consumer is registered for this webhook event.',
        status: 422,
        retryable: false,
      },
    });
  });

  it('acknowledges unsupported stored Cents order statuses without effects', async () => {
    const { deps, execute } = setup();
    await expect(
      execute(event({ payload: { ...submitted(), status: 'IN_PROGRESS' } })),
    ).resolves.toEqual(acknowledged);
    expect(deps.resolveSourceLocation).not.toHaveBeenCalled();
    expect(deps.proposeIncomingOrder).not.toHaveBeenCalled();
  });

  it('resolves the exact binding and proposes one mapped submitted candidate', async () => {
    const { deps, execute } = setup();
    await expect(execute(event())).resolves.toEqual(acknowledged);
    expect(deps.resolveSourceLocation).toHaveBeenCalledWith({
      source: 'cents',
      externalLocationId: 'store-1',
    });
    expect(deps.proposeIncomingOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cents',
        externalOrderId: 'order-1',
        proposalKind: 'submitted_order',
        revision: expect.objectContaining({
          hash: 'a'.repeat(64),
          adapterVersion: 'cents-webhook-v3',
        }),
        snapshot: expect.objectContaining({
          fulfillment: {
            typeCode: 'wash_fold',
            locationId: 'location-1',
            estimatedWeightLbs: 74,
            estimatedWeightSource: 'source_estimate',
          },
        }),
      }),
    );
    expect(deps.closeIncomingOrderSource).not.toHaveBeenCalled();
  });

  it('returns a permanent stored-event failure for an unmapped candidate', async () => {
    const resolveSourceLocation = vi.fn<ResolveSourceLocationCapability>(
      async () => ({ kind: 'success', value: null }),
    );
    const { deps, execute } = setup({ resolveSourceLocation });
    await expect(execute(event())).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        classification: 'stored_event',
        code: 'source_location_unmapped',
        retryable: false,
        status: 422,
      },
    });
    expect(deps.proposeIncomingOrder).not.toHaveBeenCalled();
  });

  it('maps an expected Orders proposal rejection to a permanent job failure', async () => {
    const proposeIncomingOrder = vi.fn<ProposeIncomingOrderCapability>(
      async () => ({
        kind: 'failure',
        failure: {
          kind: 'validation',
          code: 'incoming_order_proposal_invalid',
          message: 'The incoming Order candidate is incomplete.',
        },
      }),
    );
    const { execute } = setup({ proposeIncomingOrder });
    await expect(execute(event())).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'validation',
        classification: 'orders',
        code: 'incoming_order_proposal_invalid',
        message: 'The incoming Order candidate is incomplete.',
        safeMessage: 'The incoming Order candidate is incomplete.',
        status: 400,
        retryable: false,
      },
    });
  });

  it.each([
    ['COMPLETED', 'completed'],
    ['CANCELED', 'canceled'],
  ] as const)(
    'closes terminal %s evidence before any Production resolution',
    async (status, terminalCode) => {
      const { deps, execute } = setup();
      await expect(
        execute(event({ payload: terminal(status) })),
      ).resolves.toEqual(acknowledged);
      expect(deps.closeIncomingOrderSource).toHaveBeenCalledWith({
        context: {
          origin: 'cents',
          principal: { kind: 'system', id: 'cents-webhook' },
        },
        source: 'cents',
        externalOrderId: 'order-1',
        terminalCode,
        revision: {
          at: new Date('2026-07-10T13:00:00.000Z'),
          hash: 'a'.repeat(64),
          adapterVersion: 'cents-webhook-v3',
          observedAt: new Date('2026-07-10T13:00:01.000Z'),
          normalizedPayload: terminal(status),
        },
      });
      expect(deps.resolveSourceLocation).not.toHaveBeenCalled();
      expect(deps.proposeIncomingOrder).not.toHaveBeenCalled();
      expect(deps.resolveSourceClosedFulfillment).not.toHaveBeenCalled();
    },
  );

  it('resolves Production only after Orders returns an accepted canonical fulfillment', async () => {
    const closeIncomingOrderSource = vi.fn<CloseIncomingOrderSourceCapability>(
      async () => ({
        kind: 'success',
        value: {
          canonical: {
            orderId: '83000000-0000-4000-8000-000000000002',
            fulfillmentId: '83000000-0000-4000-8000-000000000003',
            locationId: 'location-1',
            releaseState: 'unreleased',
          },
        },
      }),
    );
    const resolveSourceClosedFulfillment =
      vi.fn<ResolveSourceClosedFulfillmentCapability>(async () => ({
        kind: 'success',
        value: { outcome: 'already_resolved' },
      }));
    const { execute } = setup({
      closeIncomingOrderSource,
      resolveSourceClosedFulfillment,
    });
    await expect(
      execute(event({ payload: terminal('COMPLETED') })),
    ).resolves.toEqual(acknowledged);
    expect(resolveSourceClosedFulfillment).toHaveBeenCalledWith({
      locationId: 'location-1',
      fulfillmentId: '83000000-0000-4000-8000-000000000003',
      actorId: '00000000-0000-4000-8000-000000000000',
      idempotencyKey:
        'source-closed-fulfillment:83000000-0000-4000-8000-000000000001',
    });
  });

  it('returns retryable projection-pending when Production has not projected accepted work', async () => {
    const closeIncomingOrderSource = vi.fn<CloseIncomingOrderSourceCapability>(
      async () => ({
        kind: 'success',
        value: {
          canonical: {
            orderId: '83000000-0000-4000-8000-000000000002',
            fulfillmentId: '83000000-0000-4000-8000-000000000003',
            locationId: 'location-1',
            releaseState: 'unreleased',
          },
        },
      }),
    );
    const resolveSourceClosedFulfillment =
      vi.fn<ResolveSourceClosedFulfillmentCapability>(async () => ({
        kind: 'success',
        value: { outcome: 'not_found' },
      }));
    const { execute } = setup({
      closeIncomingOrderSource,
      resolveSourceClosedFulfillment,
    });
    await expect(
      execute(event({ payload: terminal('COMPLETED') })),
    ).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'external_service',
        code: 'production_projection_pending',
        message:
          'The accepted fulfillment has not been projected into Production yet.',
        safeMessage:
          'The accepted fulfillment is waiting for its Production projection.',
        status: 503,
        retryable: true,
      },
    });
  });

  it.each(['resolved', 'already_resolved', 'review_required'] as const)(
    'acknowledges Production %s outcome',
    async (outcome) => {
      const closeIncomingOrderSource =
        vi.fn<CloseIncomingOrderSourceCapability>(async () => ({
          kind: 'success',
          value: {
            canonical: {
              orderId: '83000000-0000-4000-8000-000000000002',
              fulfillmentId: '83000000-0000-4000-8000-000000000003',
              locationId: 'location-1',
              releaseState: 'unreleased',
            },
          },
        }));
      const resolveSourceClosedFulfillment =
        vi.fn<ResolveSourceClosedFulfillmentCapability>(async () => ({
          kind: 'success',
          value: { outcome },
        }));
      const { execute } = setup({
        closeIncomingOrderSource,
        resolveSourceClosedFulfillment,
      });
      await expect(
        execute(event({ payload: terminal('CANCELED') })),
      ).resolves.toEqual(acknowledged);
    },
  );

  it('maps an expected Orders close rejection before Production', async () => {
    const closeIncomingOrderSource = vi.fn<CloseIncomingOrderSourceCapability>(
      async () => ({
        kind: 'failure',
        failure: {
          kind: 'validation',
          code: 'incoming_order_source_close_invalid',
          message: 'The incoming source-terminal observation is invalid.',
        },
      }),
    );
    const { deps, execute } = setup({ closeIncomingOrderSource });
    await expect(
      execute(event({ payload: terminal('CANCELED') })),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        classification: 'orders',
        code: 'incoming_order_source_close_invalid',
        retryable: false,
      },
    });
    expect(deps.resolveSourceClosedFulfillment).not.toHaveBeenCalled();
  });

  it('preserves a divergent Orders close key as a non-retryable conflict', async () => {
    const closeIncomingOrderSource = vi.fn<CloseIncomingOrderSourceCapability>(
      async () => ({
        kind: 'failure',
        failure: {
          kind: 'conflict',
          code: 'order_idempotency_conflict',
          message:
            'The source-terminal idempotency key belongs to different evidence.',
        },
      }),
    );
    const { deps, execute } = setup({ closeIncomingOrderSource });
    await expect(
      execute(event({ payload: terminal('CANCELED') })),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        classification: 'orders',
        code: 'order_idempotency_conflict',
        status: 409,
        retryable: false,
      },
    });
    expect(deps.resolveSourceClosedFulfillment).not.toHaveBeenCalled();
  });

  it.each([
    'resolveSourceLocation',
    'proposeIncomingOrder',
    'closeIncomingOrderSource',
    'resolveSourceClosedFulfillment',
  ] as const)(
    'lets unexpected %s faults reach the job boundary',
    async (name) => {
      const failure = databaseError({
        code: `${name}_failed`,
        message: `${name} failed.`,
        safeMessage: `${name} failed.`,
        status: 503,
      });
      const rejected = vi.fn(async () => {
        throw failure;
      });
      const overrides: Partial<ProcessInboundEventDependencies> =
        name === 'resolveSourceLocation'
          ? { resolveSourceLocation: rejected }
          : name === 'proposeIncomingOrder'
            ? { proposeIncomingOrder: rejected }
            : name === 'closeIncomingOrderSource'
              ? { closeIncomingOrderSource: rejected }
              : {
                  closeIncomingOrderSource:
                    vi.fn<CloseIncomingOrderSourceCapability>(async () => ({
                      kind: 'success',
                      value: {
                        canonical: {
                          orderId: '83000000-0000-4000-8000-000000000002',
                          fulfillmentId: '83000000-0000-4000-8000-000000000003',
                          locationId: 'location-1',
                          releaseState: 'unreleased',
                        },
                      },
                    })),
                  resolveSourceClosedFulfillment: rejected,
                };
      const { execute } = setup(overrides);
      const input =
        name === 'closeIncomingOrderSource' ||
        name === 'resolveSourceClosedFulfillment'
          ? event({
              payload: terminal('COMPLETED'),
            })
          : event();
      await expect(execute(input)).rejects.toBe(failure);
    },
  );
});
