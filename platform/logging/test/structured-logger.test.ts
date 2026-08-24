import { describe, expect, it, vi } from 'vitest';
import {
  makeStructuredLogger,
  toStructuredLogAttributes,
} from '../src/structured-logger.js';

describe('structured logger', () => {
  it('emits bounded primitive attributes and excludes unsafe diagnostics', () => {
    const attributes = toStructuredLogAttributes({
      service: 'pressly-worker',
      runtime: 'worker',
      operation: 'order_outbox',
      requestId: 'safe-correlation-reference',
      eventId: 'high-cardinality-event-id',
      'sentry.trace.parent_span_id': 'safe-sentry-span-reference',
      'sentry.trace.trace_id': 'not-an-sdk-log-attribute',
      authorization: 'Bearer private-token',
      error: new Error('private failure message'),
      nested: {
        outcome: 'failed',
        durationSeconds: 0.25,
      },
    });

    expect(attributes).toEqual({
      service: 'pressly-worker',
      runtime: 'worker',
      operation: 'order_outbox',
      requestId: 'safe-correlation-reference',
      'sentry.trace.parent_span_id': 'safe-sentry-span-reference',
      'error.name': 'Error',
      'nested.outcome': 'failed',
      'nested.durationSeconds': 0.25,
    });
  });

  it('inherits child context and keeps writer failure non-authoritative', () => {
    const onWriteFailure = vi.fn();
    const logger = makeStructuredLogger({
      fields: { service: 'pressly-api' },
      write: () => {
        throw new Error('transport unavailable');
      },
      onWriteFailure,
    }).child({ runtime: 'api' });

    expect(() =>
      logger.error('api.runtime.failure', { operation: 'api_startup' }),
    ).not.toThrow();
    expect(onWriteFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        level: 'error',
        message: 'api.runtime.failure',
        attributes: {
          service: 'pressly-api',
          runtime: 'api',
          operation: 'api_startup',
        },
      }),
    );
  });
});
