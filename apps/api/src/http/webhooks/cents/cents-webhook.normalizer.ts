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

export const hashCentsWebhookRawBody = (rawBody: Uint8Array): string =>
  createHash('sha256').update(rawBody).digest('hex');

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
): IngestWebhookEventCommand => {
  const projected = decision.disposition !== 'ignore';
  const subjectId =
    decision.disposition === 'project_order'
      ? decision.order.externalOrderId
      : decision.disposition === 'project_customer'
        ? decision.customer.externalUserId
        : decision.disposition === 'record_marketing'
          ? decision.marketing.customer.externalUserId
          : null;
  const payload =
    decision.disposition === 'project_order'
      ? decision.order
      : decision.disposition === 'project_customer'
        ? decision.customer
        : decision.disposition === 'record_marketing'
          ? decision.marketing
          : null;

  return {
    source: 'cents',
    eventType: decision.receipt.eventKind,
    deduplicationKey: decision.receipt.deduplicationKey,
    subjectType: decision.receipt.classification,
    subjectId,
    sourceLocationId:
      decision.disposition === 'project_order'
        ? decision.order.externalStoreId
        : null,
    sourceOccurredAt: decision.receipt.sourceUpdatedAt,
    payload,
    rawBodySha256: decision.receipt.rawBodySha256,
    disposition: projected ? 'process' : 'ignore',
  };
};

type WireMoney = z.infer<typeof centsWireMoneySchema>;
type WireOrderStatus = z.infer<typeof centsWireOrderStatusSchema>;
type JsonValue = NonNullable<IngestWebhookEventCommand['payload']>;

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

const asJsonValue = (value: unknown): JsonValue => {
  const parsed = z.json().parse(JSON.parse(JSON.stringify(value)));
  if (parsed === null) throw new Error('Expected a non-null JSON value.');
  return parsed;
};

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

const nullableText = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
};

const normalizeCustomer = (input: {
  customer: z.infer<typeof centsCustomerWireSchema>;
  sourceSnapshot: JsonValue;
}) => ({
  externalUserId: asIdentifier(input.customer.id),
  centsCustomerId:
    input.customer.centsCustomerId === undefined
      ? null
      : asIdentifier(input.customer.centsCustomerId),
  firstName: nullableText(input.customer.firstName),
  lastName: nullableText(input.customer.lastName),
  phone: nullableText(input.customer.phoneNumber),
  businessName: nullableText(input.customer.businessName),
  email: nullableText(input.customer.email),
  isCommercial: input.customer.isCommercial ?? null,
  isInvoicingEnabled: input.customer.isInvoicingEnabled ?? null,
  referralCode: nullableText(input.customer.referralCode),
  sourceUpdatedAt: input.customer.updatedAt ?? null,
  sourceSnapshot: input.sourceSnapshot,
});

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
    sourceMetadata: JsonValue;
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
      sourceMetadata: asJsonValue(service),
    });
  }

  const order = parsedOrder.data;
  const parsedCustomer =
    input.envelope['customer'] === undefined
      ? null
      : centsCustomerWireSchema.safeParse(input.envelope['customer']);
  if (parsedCustomer !== null && !parsedCustomer.success)
    return failure(
      'invalid_cents_customer_payload',
      'The Cents order customer is malformed.',
    );
  const orderTotalCents =
    order.orderTotal === undefined
      ? services.reduce((total, service) => total + service.totalPriceCents, 0)
      : dollarsToCents(order.orderTotal);
  const balanceDueCents =
    order.balanceDue === undefined ? null : dollarsToCents(order.balanceDue);
  if (
    orderTotalCents === null ||
    (balanceDueCents === null && order.balanceDue !== undefined)
  )
    return failure(
      'invalid_cents_money',
      'The Cents order contains an invalid total or balance.',
    );
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
        orderCode:
          order.orderCode === undefined ? null : asIdentifier(order.orderCode),
        externalStoreId: asIdentifier(order.storeId),
        status: canonicalStatus(order.status),
        dueAt: order.dueDate,
        sourceUpdatedAt,
        bagCount: null,
        totalAmountCents: orderTotalCents,
        balanceDueCents,
        services,
        customer:
          parsedCustomer === null
            ? null
            : normalizeCustomer({
                customer: parsedCustomer.data,
                sourceSnapshot: asJsonValue(input.envelope),
              }),
        sourceSnapshot: asJsonValue(input.envelope),
      },
    },
  };
};

const normalizeCustomerEvent = (input: {
  envelope: z.infer<typeof centsWebhookWireEnvelopeSchema>;
  eventKind: string;
  classification: 'customer' | 'marketing';
  rawBodySha256: string;
}): CentsWebhookNormalizationResult => {
  const parsed = centsCustomerWireSchema.safeParse(input.envelope['customer']);
  if (!parsed.success)
    return failure(
      'invalid_cents_customer_payload',
      'The Cents customer webhook is malformed.',
    );

  const customer = normalizeCustomer({
    customer: parsed.data,
    sourceSnapshot: asJsonValue(input.envelope),
  });
  const receipt = makeReceipt({
    eventKind: input.eventKind,
    classification: input.classification,
    vendorEntityId: customer.externalUserId,
    sourceUpdatedAt: customer.sourceUpdatedAt,
    rawBodySha256: input.rawBodySha256,
  });

  if (input.classification === 'customer')
    return {
      ok: true,
      value: {
        disposition: 'project_customer',
        receipt: { ...receipt, classification: 'customer' },
        customer,
      },
    };
  return {
    ok: true,
    value: {
      disposition: 'record_marketing',
      receipt: { ...receipt, classification: 'marketing' },
      marketing: {
        customer,
        granted: true,
        sourceSnapshot: asJsonValue(input.envelope),
      },
    },
  };
};

const normalizeIgnored = (input: {
  envelope: z.infer<typeof centsWebhookWireEnvelopeSchema>;
  eventKind: string;
  rawBodySha256: string;
}): CentsWebhookNormalizationResult => {
  const entity = unknownEntitySchema.safeParse(
    input.envelope['customer'] ?? input.envelope['order'],
  );
  return {
    ok: true,
    value: {
      disposition: 'ignore',
      receipt: makeReceipt({
        eventKind: input.eventKind,
        classification: 'unknown',
        vendorEntityId: entity.success ? asIdentifier(entity.data.id) : null,
        sourceUpdatedAt: entity.success
          ? (entity.data.updatedAt ?? null)
          : null,
        rawBodySha256: input.rawBodySha256,
      }),
      reason: 'unsupported_event',
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

  const rawBodySha256 = hashCentsWebhookRawBody(input.rawBody);

  if (centsOrderWebhookEventKindSchema.safeParse(eventKind).success)
    return normalizeOrder({
      envelope: parsedEnvelope.data,
      eventKind,
      rawBodySha256,
    });

  if (centsCustomerWebhookEventKindSchema.safeParse(eventKind).success)
    return normalizeCustomerEvent({
      envelope: parsedEnvelope.data,
      eventKind,
      classification: 'customer',
      rawBodySha256,
    });

  if (centsMarketingWebhookEventKindSchema.safeParse(eventKind).success)
    return normalizeCustomerEvent({
      envelope: parsedEnvelope.data,
      eventKind,
      classification: 'marketing',
      rawBodySha256,
    });

  return normalizeIgnored({
    envelope: parsedEnvelope.data,
    eventKind,
    rawBodySha256,
  });
};
