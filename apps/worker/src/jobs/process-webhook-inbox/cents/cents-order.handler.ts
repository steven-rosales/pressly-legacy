import {
  centsCanonicalOrderInputSchema,
  type CentsCanonicalOrderInput,
} from '@pressly/contracts';
import { makeAppError, type AppError } from '@pressly/errors';
import type { OrdersApplication } from '@pressly/orders';
import type { OrderCustomer } from '@pressly/orders';
import type { UsersApplication } from '@pressly/users';
import type {
  ClaimedWebhookEvent,
  WebhookIngestionApplication,
} from '@pressly/webhook-ingestion';
import type {
  EventConsumerOutcome,
  WebhookEventConsumer,
} from '../webhook-inbox.job.ts';
import {
  centsWebhookCommandContext,
  observeCentsCustomer,
} from './cents-customer-observation.ts';

export const deriveCentsWeightLbs = (
  services: CentsCanonicalOrderInput['services'],
): number | null => {
  const weight =
    Math.round(
      services
        .filter((service) => service.category === 'LAUNDRY')
        .reduce(
          (total, service) =>
            total + service.totalPriceCents / service.unitPriceCents,
          0,
        ) * 1_000,
    ) / 1_000;
  return Number.isFinite(weight) && weight > 0 ? weight : null;
};

const permanentFailure = (error: AppError): EventConsumerOutcome => ({
  tag: 'err',
  error,
  retryable: false,
});

const invalidEvent = (code: string, message: string): EventConsumerOutcome =>
  permanentFailure(
    makeAppError({
      kind: 'ValidationError',
      code,
      message,
      safeMessage: message,
      status: 422,
    }),
  );

type CentsOrderLifecycleProposal = Readonly<{
  state: 'open' | 'canceled';
  releaseState: 'unreleased' | 'released' | 'withdrawn';
}>;

const centsOrderLifecycleByStatus = {
  SUBMITTED: { state: 'open', releaseState: 'unreleased' },
  READY_FOR_PICKUP: { state: 'open', releaseState: 'unreleased' },
  PICKED_UP: { state: 'open', releaseState: 'unreleased' },
  IN_PROGRESS: { state: 'open', releaseState: 'released' },
  READY_FOR_RETURN: { state: 'open', releaseState: 'released' },
  OUT_FOR_DELIVERY: { state: 'open', releaseState: 'released' },
  COMPLETED: { state: 'open', releaseState: 'released' },
  CANCELED: { state: 'canceled', releaseState: 'withdrawn' },
} as const satisfies Record<
  CentsCanonicalOrderInput['status'],
  CentsOrderLifecycleProposal
>;

export const deriveCentsOrderLifecycle = (
  status: CentsCanonicalOrderInput['status'],
): CentsOrderLifecycleProposal => centsOrderLifecycleByStatus[status];

export const makeCentsOrderHandler =
  (deps: {
    resolveSourceLocation: WebhookIngestionApplication['resolveSourceLocation'];
    users: UsersApplication;
    orders: OrdersApplication;
  }): WebhookEventConsumer =>
  async (event: ClaimedWebhookEvent): Promise<EventConsumerOutcome> => {
    const parsed = centsCanonicalOrderInputSchema.safeParse(event.payload);
    if (!parsed.success)
      return invalidEvent(
        'cents_order_payload_invalid',
        'The stored Cents order payload is invalid.',
      );
    const order = parsed.data;
    if (
      event.subjectId !== order.externalOrderId ||
      event.sourceLocationId === null ||
      event.sourceLocationId !== order.externalStoreId
    )
      return invalidEvent(
        'cents_order_identity_invalid',
        'The stored Cents order identity or location is inconsistent.',
      );
    if (event.sourceOccurredAt !== order.sourceUpdatedAt)
      return invalidEvent(
        'cents_order_revision_invalid',
        'The stored Cents order revision is inconsistent.',
      );

    const locationId = await deps.resolveSourceLocation({
      source: 'cents',
      externalLocationId: event.sourceLocationId,
    });
    if (locationId === null)
      return invalidEvent(
        'source_location_unmapped',
        'The external location is not mapped to a production location.',
      );

    let canonicalCustomer: OrderCustomer;
    if (order.customer === null)
      canonicalCustomer = {
        resolution: 'not_provided',
        userId: null,
        externalUserId: null,
      };
    else {
      const customer = await observeCentsCustomer({
        users: deps.users,
        event,
        customer: order.customer,
        fallbackRevisionAt: order.sourceUpdatedAt,
      });
      if (customer.tag === 'err') return customer;
      canonicalCustomer = {
        resolution: 'resolved',
        userId: customer.userId,
        externalUserId: order.customer.externalUserId,
      };
    }
    const estimatedWeightLbs = deriveCentsWeightLbs(order.services);
    const lifecycle = deriveCentsOrderLifecycle(order.status);
    const observed = await deps.orders.observeSource({
      context: centsWebhookCommandContext,
      source: 'cents',
      externalOrderId: order.externalOrderId,
      customer: canonicalCustomer,
      displayNumber: order.orderCode,
      state: lifecycle.state,
      dueAt: new Date(order.dueAt),
      currency: 'USD',
      totalAmountCents: order.totalAmountCents,
      balanceDueCents: order.balanceDueCents,
      items: order.services.map((service) => ({
        lineKey: service.externalServiceId,
        itemType: 'service',
        code: service.category,
        description: service.name,
        quantity: service.quantity,
        unit: 'service_unit',
        unitPriceCents: service.unitPriceCents,
        totalAmountCents: service.totalPriceCents,
        sourceMetadata: service.sourceMetadata,
      })),
      fulfillment: {
        typeCode: order.services.some(
          (service) => service.category === 'LAUNDRY',
        )
          ? 'wash_fold'
          : 'external_order',
        locationId,
        releaseState: lifecycle.releaseState,
        estimatedWeightLbs,
        estimatedWeightSource:
          estimatedWeightLbs === null ? null : 'source_estimate',
        bagCount: order.bagCount,
      },
      revision: {
        at: new Date(order.sourceUpdatedAt),
        hash: event.payloadHash,
        adapterVersion: 'cents-webhook-v2',
        lifecycleCode: order.status,
        observedAt: new Date(event.receivedAt),
        normalizedPayload: order.sourceSnapshot,
      },
    });
    if (observed.tag === 'ok') return { tag: 'ok' };
    return {
      tag: 'err',
      error: observed.error,
      retryable: observed.error.status >= 500,
    };
  };
