import {
  centsCanonicalOrderInputSchema,
  type CentsCanonicalOrderInput,
} from '@pressly/contracts';
import { makeAppError, type AppError } from '@pressly/errors';
import type { ProductionApplication } from '@pressly/production';
import type {
  ClaimedWebhookEvent,
  WebhookIngestionApplication,
} from '@pressly/webhook-ingestion';
import type {
  EventConsumerOutcome,
  WebhookEventConsumer,
} from '../../lpms/processor.ts';
import { mapCentsDemandPhase } from './cents-demand-phase.ts';

export const deriveCentsWeightLbs = (
  services: CentsCanonicalOrderInput['services'],
): number | null => {
  const weight =
    Math.round(
      services.reduce(
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

const retryableProductionCodes = new Set(['order_demand_application_failed']);

export const makeCentsOrderConsumer =
  (deps: {
    resolveSourceLocation: WebhookIngestionApplication['resolveSourceLocation'];
    applyOrderDemand: ProductionApplication['applyOrderDemand'];
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
      event.sourceLocationId === null ||
      event.sourceLocationId !== order.externalStoreId
    )
      return invalidEvent(
        'cents_order_location_invalid',
        'The stored Cents order location is missing or inconsistent.',
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

    const estimatedWeightLbs = deriveCentsWeightLbs(order.services);

    const applied = await deps.applyOrderDemand({
      demandKey: `cents:order:${order.externalOrderId}`,
      displayReference: order.externalOrderId,
      locationId,
      revisionAt: order.sourceUpdatedAt,
      revisionHash: event.payloadHash,
      phase: mapCentsDemandPhase(order.status),
      sourceStatusCode: order.status,
      dueAt: order.dueAt,
      estimatedWeightLbs,
      estimatedWeightSource:
        estimatedWeightLbs === null ? null : 'external_estimate',
      bagCount: order.bagCount,
      idempotencyKey: `webhook:${event.eventId}`,
    });
    if (applied.tag === 'ok') return { tag: 'ok' };
    return {
      tag: 'err',
      error: applied.error,
      retryable: retryableProductionCodes.has(applied.error.code),
    };
  };
