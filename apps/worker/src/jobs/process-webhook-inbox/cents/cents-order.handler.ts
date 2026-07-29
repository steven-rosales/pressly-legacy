import {
  centsOrderTerminalClosePayloadSchema,
  centsSubmittedOrderCandidatePayloadSchema,
  type CentsSubmittedOrderCandidatePayload,
} from '@pressly/contracts';
import { makeAppError, type AppError } from '@pressly/errors';
import type { OrdersWorkerApplication } from '@pressly/orders';
import type { ProductionApplication } from '@pressly/production';
import type {
  ClaimedWebhookEvent,
  WebhookIngestionApplication,
} from '@pressly/webhook-ingestion';
import type {
  EventConsumerOutcome,
  WebhookEventConsumer,
} from '../webhook-inbox.job.ts';

const centsProposalContext = {
  origin: 'cents',
  principal: { kind: 'system', id: 'cents-webhook' },
} as const;

const sourceClosureAutomationActorId = '00000000-0000-4000-8000-000000000000';

export const deriveCentsWeightLbs = (
  services: CentsSubmittedOrderCandidatePayload['services'],
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

type ProcessableCentsOrder = Readonly<{
  externalOrderId: string;
  externalStoreId: string;
  sourceUpdatedAt: string;
}>;

const validateStoredIdentity = (
  event: ClaimedWebhookEvent,
  order: ProcessableCentsOrder,
): EventConsumerOutcome | null => {
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
  return null;
};

const mutationOutcome = (
  result: Awaited<
    ReturnType<
      OrdersWorkerApplication[
        | 'proposeIncomingOrder'
        | 'closeIncomingOrderSource']
    >
  >,
): EventConsumerOutcome =>
  result.tag === 'ok'
    ? { tag: 'ok' }
    : {
        tag: 'err',
        error: result.error,
        retryable: result.error.status >= 500,
      };

export const makeCentsOrderHandler =
  (deps: {
    resolveSourceLocation: WebhookIngestionApplication['resolveSourceLocation'];
    orders: Pick<
      OrdersWorkerApplication,
      'proposeIncomingOrder' | 'closeIncomingOrderSource'
    >;
    production: Pick<ProductionApplication, 'resolveSourceClosedFulfillment'>;
  }): WebhookEventConsumer =>
  async (event: ClaimedWebhookEvent): Promise<EventConsumerOutcome> => {
    const storedStatus =
      event.payload !== null &&
      typeof event.payload === 'object' &&
      !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)['status']
        : null;

    // Drain legacy and unsupported observations without granting them a
    // lifecycle capability. New ingress queues only these three exact states.
    if (
      storedStatus !== 'SUBMITTED' &&
      storedStatus !== 'COMPLETED' &&
      storedStatus !== 'CANCELED'
    )
      return { tag: 'ok' };

    if (storedStatus === 'COMPLETED' || storedStatus === 'CANCELED') {
      const parsed = centsOrderTerminalClosePayloadSchema.safeParse(
        event.payload,
      );
      if (!parsed.success)
        return invalidEvent(
          'cents_order_payload_invalid',
          'The stored Cents terminal order payload is invalid.',
        );
      const order = parsed.data;
      const invalidIdentity = validateStoredIdentity(event, order);
      if (invalidIdentity !== null) return invalidIdentity;

      const closed = await deps.orders.closeIncomingOrderSource({
        context: centsProposalContext,
        source: 'cents',
        externalOrderId: order.externalOrderId,
        terminalCode: order.status === 'COMPLETED' ? 'completed' : 'canceled',
        revision: {
          at: new Date(order.sourceUpdatedAt),
          hash: event.payloadHash,
          adapterVersion: 'cents-webhook-v3',
          observedAt: new Date(event.receivedAt),
          normalizedPayload: order,
        },
      });
      if (closed.tag === 'err') return mutationOutcome(closed);
      if (closed.value.canonical === null) return { tag: 'ok' };

      const resolution = await deps.production.resolveSourceClosedFulfillment({
        locationId: closed.value.canonical.locationId,
        fulfillmentId: closed.value.canonical.fulfillmentId,
        actorId: sourceClosureAutomationActorId,
        idempotencyKey: `source-closed-fulfillment:${event.eventId}`,
      });
      if (resolution.tag === 'err')
        return {
          tag: 'err',
          error: resolution.error,
          retryable: resolution.error.status >= 500,
        };
      if (resolution.value.outcome === 'not_found')
        return {
          tag: 'err',
          retryable: true,
          error: makeAppError({
            kind: 'ExternalServiceError',
            code: 'production_projection_pending',
            message:
              'The accepted fulfillment has not been projected into Production yet.',
            safeMessage:
              'The accepted fulfillment is waiting for its Production projection.',
            status: 503,
          }),
        };

      return { tag: 'ok' };
    }

    const parsed = centsSubmittedOrderCandidatePayloadSchema.safeParse(
      event.payload,
    );
    if (!parsed.success)
      return invalidEvent(
        'cents_order_payload_invalid',
        'The stored Cents order payload is invalid.',
      );
    const order = parsed.data;
    const invalidIdentity = validateStoredIdentity(event, order);
    if (invalidIdentity !== null) return invalidIdentity;

    const locationId = await deps.resolveSourceLocation({
      source: 'cents',
      externalLocationId: order.externalStoreId,
    });
    if (locationId === null)
      return invalidEvent(
        'source_location_unmapped',
        'The external location is not mapped to a production location.',
      );

    const estimatedWeightLbs = deriveCentsWeightLbs(order.services);
    const proposed = await deps.orders.proposeIncomingOrder({
      context: centsProposalContext,
      source: 'cents',
      externalOrderId: order.externalOrderId,
      proposalKind: 'submitted_order',
      revision: {
        at: new Date(order.sourceUpdatedAt),
        hash: event.payloadHash,
        adapterVersion: 'cents-webhook-v3',
        observedAt: new Date(event.receivedAt),
        normalizedPayload: order,
      },
      snapshot: {
        customer:
          order.customer === null
            ? null
            : {
                externalUserId: order.customer.externalUserId,
                firstName: order.customer.firstName,
                lastName: order.customer.lastName,
                businessName: order.customer.businessName,
                phone: order.customer.phone,
                email: order.customer.email,
                normalizedPayload: {
                  externalUserId: order.customer.externalUserId,
                },
              },
        displayNumber: order.orderCode,
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
          sourceMetadata: {},
        })),
        fulfillment: {
          typeCode: order.services.some(
            (service) => service.category === 'LAUNDRY',
          )
            ? 'wash_fold'
            : 'external_order',
          locationId,
          estimatedWeightLbs,
          estimatedWeightSource:
            estimatedWeightLbs === null ? null : 'source_estimate',
        },
      },
    });
    return mutationOutcome(proposed);
  };
