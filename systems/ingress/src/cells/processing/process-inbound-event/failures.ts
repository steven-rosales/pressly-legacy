import type {
  OrdersInboundFailure,
  ProcessInboundEventExpectedFailure,
  ProcessInboundEventPermanentFailure,
  ProcessInboundEventProjectionPendingFailure,
} from './types.ts';

export const storedInboundEventFailure = (
  code: string,
  message: string,
): ProcessInboundEventPermanentFailure => ({
  kind: 'validation',
  classification: 'stored_event',
  code,
  message,
  safeMessage: message,
  status: 422,
  retryable: false,
});

export const missingInboundConsumerFailure = (
  consumerKey: string,
): ProcessInboundEventPermanentFailure => ({
  kind: 'validation',
  classification: 'missing_consumer',
  code: 'webhook_event_consumer_missing',
  message: `No consumer is registered for ${consumerKey}.`,
  safeMessage: 'No consumer is registered for this webhook event.',
  status: 422,
  retryable: false,
});

export const ordersInboundFailure = (
  failure: OrdersInboundFailure,
): ProcessInboundEventPermanentFailure => ({
  kind: 'validation',
  classification: 'orders',
  code: failure.code,
  message: failure.message,
  safeMessage: failure.safeMessage ?? failure.message,
  status: failure.kind === 'conflict' ? 409 : 400,
  retryable: false,
});

export const productionProjectionPendingFailure =
  (): ProcessInboundEventProjectionPendingFailure => ({
    kind: 'external_service',
    code: 'production_projection_pending',
    message:
      'The accepted fulfillment has not been projected into Production yet.',
    safeMessage:
      'The accepted fulfillment is waiting for its Production projection.',
    status: 503,
    retryable: true,
  });

export const isProcessInboundEventExpectedFailure = (
  value: unknown,
): value is ProcessInboundEventExpectedFailure => {
  if (typeof value !== 'object' || value === null) return false;
  const failure = value as Record<string, unknown>;
  return (
    (failure['kind'] === 'validation' ||
      failure['kind'] === 'external_service') &&
    typeof failure['code'] === 'string' &&
    typeof failure['message'] === 'string' &&
    typeof failure['safeMessage'] === 'string' &&
    (failure['status'] === 400 ||
      failure['status'] === 409 ||
      failure['status'] === 422 ||
      failure['status'] === 503) &&
    typeof failure['retryable'] === 'boolean'
  );
};
