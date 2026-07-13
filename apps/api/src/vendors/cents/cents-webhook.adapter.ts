import { createHash } from 'node:crypto';
import {
  centsCustomerWebhookEventKindSchema,
  centsCustomerWireSchema,
  centsMarketingWebhookEventKindSchema,
  centsOrderServiceWireSchema,
  centsOrderWebhookEventKindSchema,
  centsOrderWireSchema,
  centsWebhookWireEnvelopeSchema,
  type CentsIngressDecision,
  type IngestWebhookEventCommand,
  type centsWireMoneySchema,
  type centsWireOrderStatusSchema,
} from '@pressly/contracts';
import { z } from 'zod';

export const CENTS_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

export type CentsWebhookNormalizationErrorCode =
  | 'cents_webhook_body_too_large'
  | 'invalid_cents_webhook_envelope'
  | 'conflicting_cents_event_kind'
  | 'invalid_cents_order_payload'
  | 'invalid_cents_customer_payload'
  | 'invalid_cents_money'
  | 'conflicting_cents_unit_price';

export type CentsWebhookNormalizationResult =
  | Readonly<{ ok: true; value: CentsIngressDecision }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: CentsWebhookNormalizationErrorCode;
        message: string;
      }>;
    }>;

export const toCentsWebhookEventCommand = (
  decision: CentsIngressDecision,
): IngestWebhookEventCommand => ({
  source: 'cents',
  eventType: decision.receipt.eventKind,
  deduplicationKey: decision.receipt.deduplicationKey,
  subjectType: decision.receipt.classification,
  subjectId:
    decision.disposition === 'project_order'
      ? decision.order.externalOrderId
      : null,
  sourceLocationId:
    decision.disposition === 'project_order'
      ? decision.order.externalStoreId
      : null,
  sourceOccurredAt: decision.receipt.sourceUpdatedAt,
  payload: decision.disposition === 'project_order' ? decision.order : null,
  rawBodySha256: decision.receipt.rawBodySha256,
  disposition: decision.disposition === 'project_order' ? 'process' : 'ignore',
});

type WireMoney = z.infer<typeof centsWireMoneySchema>;
type WireOrderStatus = z.infer<typeof centsWireOrderStatusSchema>;

const unknownEntitySchema = z
  .object({
    id: z.union([z.string().trim().min(1), z.number().int().nonnegative()]),
    updatedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .passthrough();

const servicesWireSchema = z.array(centsOrderServiceWireSchema);

const failure = (
  code: CentsWebhookNormalizationErrorCode,
  message: string,
): CentsWebhookNormalizationResult => ({ ok: false, error: { code, message } });

const asIdentifier = (value: string | number): string => String(value).trim();

const dollarsToCents = (value: WireMoney): number | null => {
  const decimal = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(decimal);
  if (match === null) return null;

  const fraction = match[2] ?? '';
  if (fraction.slice(2).replaceAll('0', '') !== '') return null;

  const cents =
    BigInt(match[1] ?? '0') * 100n + BigInt(`${fraction}00`.slice(0, 2));

  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
};

export const deriveCentsDeduplicationKey = (input: {
  eventKind: string;
  vendorEntityId: string | null;
  sourceUpdatedAt: string | null;
  rawBodySha256: string;
}): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        input.eventKind,
        input.vendorEntityId,
        input.sourceUpdatedAt,
        input.rawBodySha256,
      ]),
    )
    .digest('hex');

const canonicalStatus = (
  status: WireOrderStatus,
):
  | 'SUBMITTED'
  | 'READY_FOR_PICKUP'
  | 'PICKED_UP'
  | 'IN_PROGRESS'
  | 'READY_FOR_RETURN'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'CANCELED' => (status === 'CANCELLED' ? 'CANCELED' : status);

const resolveEventKind = (
  envelope: z.infer<typeof centsWebhookWireEnvelopeSchema>,
): CentsWebhookNormalizationResult | string => {
  if (
    envelope.action !== undefined &&
    envelope.event !== undefined &&
    envelope.action !== envelope.event
  )
    return failure(
      'conflicting_cents_event_kind',
      'The Cents webhook action and event fields conflict.',
    );

  return envelope.action ?? envelope.event ?? '';
};

const makeReceipt = <
  Classification extends 'order' | 'customer' | 'marketing' | 'unknown',
>(input: {
  eventKind: string;
  classification: Classification;
  vendorEntityId: string | null;
  sourceUpdatedAt: string | null;
  rawBodySha256: string;
}) => ({
  deduplicationKey: deriveCentsDeduplicationKey(input),
  eventKind: input.eventKind,
  classification: input.classification,
  rawBodySha256: input.rawBodySha256,
  sourceUpdatedAt: input.sourceUpdatedAt,
});

const normalizeOrder = (input: {
  envelope: z.infer<typeof centsWebhookWireEnvelopeSchema>;
  eventKind: string;
  rawBodySha256: string;
}): CentsWebhookNormalizationResult => {
  const parsedOrder = centsOrderWireSchema.safeParse(input.envelope['order']);
  if (!parsedOrder.success)
    return failure(
      'invalid_cents_order_payload',
      'The Cents order webhook is malformed.',
    );

  const parsedServices = servicesWireSchema.safeParse(
    input.envelope['services'] ?? parsedOrder.data.services,
  );
  if (!parsedServices.success)
    return failure(
      'invalid_cents_order_payload',
      'The Cents order services are malformed.',
    );

  const services: Array<{
    externalServiceId: string;
    name: string;
    category: string;
    quantity: number;
    totalPriceCents: number;
    unitPriceCents: number;
  }> = [];

  for (const service of parsedServices.data) {
    const totalPriceCents = dollarsToCents(service.totalPrice);
    const unitPriceCents =
      service.unitPrice === undefined
        ? null
        : dollarsToCents(service.unitPrice);
    const unitCostCents =
      service.unitCost === undefined ? null : dollarsToCents(service.unitCost);

    if (
      totalPriceCents === null ||
      (service.unitPrice !== undefined && unitPriceCents === null) ||
      (service.unitCost !== undefined && unitCostCents === null)
    )
      return failure(
        'invalid_cents_money',
        'The Cents order contains an invalid currency value.',
      );

    if (
      unitPriceCents !== null &&
      unitCostCents !== null &&
      unitPriceCents !== unitCostCents
    )
      return failure(
        'conflicting_cents_unit_price',
        'The Cents unitPrice and unitCost fields conflict.',
      );

    const canonicalUnitPrice = unitPriceCents ?? unitCostCents;
    if (canonicalUnitPrice === null || canonicalUnitPrice <= 0)
      return failure(
        'invalid_cents_money',
        'The Cents service unit price must be positive.',
      );

    const category = service.serviceCategoryType ?? service.serviceCategory;
    if (category === undefined)
      return failure(
        'invalid_cents_order_payload',
        'The Cents service category is missing.',
      );

    services.push({
      externalServiceId: asIdentifier(service.id),
      name: service.name,
      category,
      quantity: service.quantity,
      totalPriceCents,
      unitPriceCents: canonicalUnitPrice,
    });
  }

  const order = parsedOrder.data;
  const externalOrderId = asIdentifier(order.id);
  const sourceUpdatedAt = order.updatedAt;
  const receipt = makeReceipt({
    eventKind: input.eventKind,
    classification: 'order',
    vendorEntityId: externalOrderId,
    sourceUpdatedAt,
    rawBodySha256: input.rawBodySha256,
  });

  return {
    ok: true,
    value: {
      disposition: 'project_order',
      receipt: { ...receipt, classification: 'order', sourceUpdatedAt },
      order: {
        externalOrderId,
        externalStoreId: asIdentifier(order.storeId),
        status: canonicalStatus(order.status),
        dueAt: order.dueDate,
        sourceUpdatedAt,
        bagCount: null,
        services,
      },
    },
  };
};

const normalizeIgnored = (input: {
  envelope: z.infer<typeof centsWebhookWireEnvelopeSchema>;
  eventKind: string;
  classification: 'customer' | 'marketing' | 'unknown';
  rawBodySha256: string;
}): CentsWebhookNormalizationResult => {
  const knownNonProduction = input.classification !== 'unknown';
  const entity = unknownEntitySchema.safeParse(
    input.envelope['customer'] ?? input.envelope['order'],
  );

  if (
    knownNonProduction &&
    !centsCustomerWireSchema.safeParse(input.envelope['customer']).success
  )
    return failure(
      'invalid_cents_customer_payload',
      'The Cents customer webhook is malformed.',
    );

  const vendorEntityId = entity.success ? asIdentifier(entity.data.id) : null;
  const sourceUpdatedAt = entity.success
    ? (entity.data.updatedAt ?? null)
    : null;

  return {
    ok: true,
    value: {
      disposition: 'ignore',
      receipt: makeReceipt({
        eventKind: input.eventKind,
        classification: input.classification,
        vendorEntityId,
        sourceUpdatedAt,
        rawBodySha256: input.rawBodySha256,
      }),
      reason: knownNonProduction ? 'non_production_event' : 'unsupported_event',
    },
  };
};

export const normalizeCentsWebhook = (input: {
  payload: unknown;
  rawBody: Uint8Array;
}): CentsWebhookNormalizationResult => {
  if (input.rawBody.byteLength > CENTS_WEBHOOK_MAX_BODY_BYTES)
    return failure(
      'cents_webhook_body_too_large',
      'The Cents webhook body exceeds the allowed size.',
    );

  const parsedEnvelope = centsWebhookWireEnvelopeSchema.safeParse(
    input.payload,
  );
  if (!parsedEnvelope.success)
    return failure(
      'invalid_cents_webhook_envelope',
      'The Cents webhook envelope is malformed.',
    );

  const eventKind = resolveEventKind(parsedEnvelope.data);
  if (typeof eventKind !== 'string') return eventKind;

  const rawBodySha256 = createHash('sha256')
    .update(input.rawBody)
    .digest('hex');

  if (centsOrderWebhookEventKindSchema.safeParse(eventKind).success)
    return normalizeOrder({
      envelope: parsedEnvelope.data,
      eventKind,
      rawBodySha256,
    });

  if (centsCustomerWebhookEventKindSchema.safeParse(eventKind).success)
    return normalizeIgnored({
      envelope: parsedEnvelope.data,
      eventKind,
      classification: 'customer',
      rawBodySha256,
    });

  if (centsMarketingWebhookEventKindSchema.safeParse(eventKind).success)
    return normalizeIgnored({
      envelope: parsedEnvelope.data,
      eventKind,
      classification: 'marketing',
      rawBodySha256,
    });

  return normalizeIgnored({
    envelope: parsedEnvelope.data,
    eventKind,
    classification: 'unknown',
    rawBodySha256,
  });
};
