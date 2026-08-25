import { describe, expect, it, vi } from 'vitest';
import { webhookEventReadyV1MessageContract } from '../../../contracts/webhook-event-ready-v1.ts';
import {
  makeProcessInboundEventCell,
  processInboundEventCellDeclaration,
} from './cell.ts';
import { processInboundEventJobSurface } from './job.ts';

const dependencies = () => ({
  resolveSourceLocation: vi.fn(async () => ({
    kind: 'success' as const,
    value: 'location-1',
  })),
  proposeIncomingOrder: vi.fn(async () => ({
    kind: 'success' as const,
    value: { outcome: 'proposed' },
  })),
  closeIncomingOrderSource: vi.fn(async () => ({
    kind: 'success' as const,
    value: { canonical: null },
  })),
  resolveSourceClosedFulfillment: vi.fn(async () => ({
    kind: 'success' as const,
    value: { outcome: 'already_resolved' as const },
  })),
});

describe('process-inbound-event reaction declaration', () => {
  it('declares the one existing durable inbox as a message-triggered job', () => {
    expect(processInboundEventCellDeclaration).toMatchObject({
      id: 'ingress.process-inbound-event.v1',
      kind: 'reaction',
      authentication: 'none',
      consistency: {
        transaction: 'none',
        concurrency: 'partitioned',
      },
      idempotency: { required: true },
      retry: {
        maxAttempts: 8,
        strategy: 'bounded-exponential-jitter',
        deadLetter: 'retain',
      },
      observability: { operation: 'ingress.process_inbound_event' },
    });
    expect(processInboundEventCellDeclaration.consumes).toEqual([
      webhookEventReadyV1MessageContract,
    ]);
    expect(processInboundEventCellDeclaration.consumes[0]).toBe(
      webhookEventReadyV1MessageContract,
    );
    expect(processInboundEventCellDeclaration.surfaces).toEqual([
      processInboundEventJobSurface,
    ]);
    expect(processInboundEventJobSurface).toMatchObject({
      id: 'ingress.process-inbound-event-job.v1',
      kind: 'job',
      trigger: 'message',
      queue: 'webhook_ingestion',
    });
  });

  it('partitions by source plus subject and falls back to event identity', () => {
    const key = processInboundEventCellDeclaration.consistency.concurrencyKey;
    const idempotency = processInboundEventCellDeclaration.idempotency.key;
    const input = {
      eventId: '83000000-0000-4000-8000-000000000001',
      source: 'cents',
      eventType: 'order_updated',
      subjectType: 'order',
      subjectId: 'order-1',
      sourceLocationId: 'store-1',
      sourceOccurredAt: null,
      receivedAt: new Date('2026-07-10T13:00:01.000Z'),
      payloadHash: 'a'.repeat(64),
      payload: {},
    } as const;
    expect(key?.(input)).toBe('cents:order-1');
    expect(key?.({ ...input, subjectId: null })).toBe(
      'cents:83000000-0000-4000-8000-000000000001',
    );
    expect(idempotency?.(input)).toBe(input.eventId);
  });

  it('presents permanent versus retryable failures without host branching', () => {
    expect(
      processInboundEventJobSurface.presentFailure({
        kind: 'validation',
        classification: 'orders',
        code: 'incoming_order_proposal_invalid',
        message: 'Private detail.',
        safeMessage: 'The incoming Order candidate is invalid.',
        status: 400,
        retryable: false,
      }),
    ).toEqual({
      code: 'incoming_order_proposal_invalid',
      message: 'The incoming Order candidate is invalid.',
      retryable: false,
      category: 'validation',
      status: 400,
    });
    expect(
      processInboundEventJobSurface.presentFailure({
        kind: 'external_service',
        code: 'production_projection_pending',
        message: 'Projection pending.',
        safeMessage: 'Production projection pending.',
        status: 503,
        retryable: true,
      }),
    ).toEqual({
      code: 'production_projection_pending',
      message: 'Production projection pending.',
      retryable: true,
      category: 'external_service',
      status: 503,
    });
  });

  it('binds only the structurally injected capabilities', () => {
    const cell = makeProcessInboundEventCell(dependencies());
    expect(cell.id).toBe(processInboundEventCellDeclaration.id);
    expect(cell.contract).toBe(processInboundEventCellDeclaration.contract);
    expect(typeof cell.execute).toBe('function');
  });
});
