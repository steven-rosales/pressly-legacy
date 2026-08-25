import type { JsonObject, JsonValue } from '@pressly/codec';
import {
  centsOrderTerminalClosePayloadSchema,
  centsSubmittedOrderCandidatePayloadSchema,
  type CentsSubmittedOrderCandidatePayload,
} from '../../../contracts/cents-v1.ts';
import type { WebhookEventReadyV1 } from '../../../contracts/webhook-event-ready-v1.ts';
import {
  missingInboundConsumerFailure,
  storedInboundEventFailure,
} from './failures.ts';
import type {
  CloseIncomingOrderSourceCommand,
  ProcessInboundEventExpectedFailure,
  ProposeIncomingOrderCommand,
} from './types.ts';

const centsProposalContext = Object.freeze({
  origin: 'cents' as const,
  principal: Object.freeze({
    kind: 'system' as const,
    id: 'cents-webhook' as const,
  }),
});

export const inboundEventConsumerKey = (event: {
  source: string;
  subjectType: string;
}): string => `${event.source}:${event.subjectType}`;

const storedStatus = (payload: JsonValue): unknown =>
  payload !== null &&
  typeof payload === 'object' &&
  !Array.isArray(payload) &&
  'status' in payload
    ? payload['status']
    : null;

const identityFailure = (
  event: WebhookEventReadyV1,
  order: Readonly<{
    externalOrderId: string;
    externalStoreId: string;
    sourceUpdatedAt: string;
  }>,
): ProcessInboundEventExpectedFailure | null => {
  if (
    event.subjectId !== order.externalOrderId ||
    event.sourceLocationId === null ||
    event.sourceLocationId !== order.externalStoreId
  )
    return storedInboundEventFailure(
      'cents_order_identity_invalid',
      'The stored Cents order identity or location is inconsistent.',
    );
  if (event.sourceOccurredAt?.toISOString() !== order.sourceUpdatedAt)
    return storedInboundEventFailure(
      'cents_order_revision_invalid',
      'The stored Cents order revision is inconsistent.',
    );
  return null;
};

export type CentsInboundEventDecision =
  | Readonly<{ kind: 'ignore' }>
  | Readonly<{
      kind: 'reject';
      failure: ProcessInboundEventExpectedFailure;
    }>
  | Readonly<{
      kind: 'propose';
      order: CentsSubmittedOrderCandidatePayload;
    }>
  | Readonly<{
      kind: 'close';
      command: CloseIncomingOrderSourceCommand;
    }>;

export const decideCentsInboundEvent = (
  event: WebhookEventReadyV1,
): CentsInboundEventDecision => {
  const consumerKey = inboundEventConsumerKey(event);
  if (consumerKey === 'cents:customer' || consumerKey === 'cents:marketing')
    return { kind: 'ignore' };
  if (consumerKey !== 'cents:order')
    return {
      kind: 'reject',
      failure: missingInboundConsumerFailure(consumerKey),
    };

  const status = storedStatus(event.payload);
  if (status !== 'SUBMITTED' && status !== 'COMPLETED' && status !== 'CANCELED')
    return { kind: 'ignore' };

  if (status === 'COMPLETED' || status === 'CANCELED') {
    const parsed = centsOrderTerminalClosePayloadSchema.safeParse(
      event.payload,
    );
    if (!parsed.success)
      return {
        kind: 'reject',
        failure: storedInboundEventFailure(
          'cents_order_payload_invalid',
          'The stored Cents terminal order payload is invalid.',
        ),
      };
    const invalid = identityFailure(event, parsed.data);
    if (invalid !== null) return { kind: 'reject', failure: invalid };
    return {
      kind: 'close',
      command: {
        context: centsProposalContext,
        source: 'cents',
        externalOrderId: parsed.data.externalOrderId,
        terminalCode:
          parsed.data.status === 'COMPLETED' ? 'completed' : 'canceled',
        revision: {
          at: new Date(parsed.data.sourceUpdatedAt),
          hash: event.payloadHash,
          adapterVersion: 'cents-webhook-v3',
          observedAt: event.receivedAt,
          normalizedPayload: parsed.data as JsonObject,
        },
      },
    };
  }

  const parsed = centsSubmittedOrderCandidatePayloadSchema.safeParse(
    event.payload,
  );
  if (!parsed.success)
    return {
      kind: 'reject',
      failure: storedInboundEventFailure(
        'cents_order_payload_invalid',
        'The stored Cents order payload is invalid.',
      ),
    };
  const invalid = identityFailure(event, parsed.data);
  return invalid === null
    ? { kind: 'propose', order: parsed.data }
    : { kind: 'reject', failure: invalid };
};

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

export const toProposeIncomingOrderCommand = (input: {
  event: WebhookEventReadyV1;
  order: CentsSubmittedOrderCandidatePayload;
  locationId: string;
}): ProposeIncomingOrderCommand => {
  const estimatedWeightLbs = deriveCentsWeightLbs(input.order.services);
  return {
    context: centsProposalContext,
    source: 'cents',
    externalOrderId: input.order.externalOrderId,
    proposalKind: 'submitted_order',
    revision: {
      at: new Date(input.order.sourceUpdatedAt),
      hash: input.event.payloadHash,
      adapterVersion: 'cents-webhook-v3',
      observedAt: input.event.receivedAt,
      normalizedPayload: input.order as JsonObject,
    },
    snapshot: {
      customer:
        input.order.customer === null
          ? null
          : {
              externalUserId: input.order.customer.externalUserId,
              firstName: input.order.customer.firstName,
              lastName: input.order.customer.lastName,
              businessName: input.order.customer.businessName,
              phone: input.order.customer.phone,
              email: input.order.customer.email,
              normalizedPayload: {
                externalUserId: input.order.customer.externalUserId,
              },
            },
      displayNumber: input.order.orderCode,
      dueAt: new Date(input.order.dueAt),
      currency: 'USD',
      totalAmountCents: input.order.totalAmountCents,
      balanceDueCents: input.order.balanceDueCents,
      items: input.order.services.map((service) => ({
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
        typeCode: input.order.services.some(
          (service) => service.category === 'LAUNDRY',
        )
          ? 'wash_fold'
          : 'external_order',
        locationId: input.locationId,
        estimatedWeightLbs,
        estimatedWeightSource:
          estimatedWeightLbs === null ? null : 'source_estimate',
      },
    },
  };
};
