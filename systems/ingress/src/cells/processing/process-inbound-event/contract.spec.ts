import { describe, expect, it } from 'vitest';
import { webhookEventReadyV1MessageContract } from '../../../contracts/webhook-event-ready-v1.ts';
import { processInboundEventContract } from './contract.ts';

const serialized = {
  eventId: '83000000-0000-4000-8000-000000000001',
  source: 'cents',
  eventType: 'order_updated',
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: '2026-07-10T13:00:00.000Z',
  receivedAt: '2026-07-10T13:00:01.000Z',
  payload: { status: 'IN_PROGRESS' },
  payloadHash: 'a'.repeat(64),
};

describe('process-inbound-event contract', () => {
  it('round-trips the business payload split from its lease receipt', () => {
    const decoded = processInboundEventContract.input.decode(serialized);
    expect(decoded).toEqual({
      kind: 'valid',
      value: {
        ...serialized,
        sourceOccurredAt: new Date('2026-07-10T13:00:00.000Z'),
        receivedAt: new Date('2026-07-10T13:00:01.000Z'),
      },
    });
    if (decoded.kind === 'invalid') return;
    expect(processInboundEventContract.input.encode(decoded.value)).toEqual(
      serialized,
    );
  });

  it('rejects invalid runtime command serialization', () => {
    const decoded = processInboundEventContract.input.decode(serialized);
    if (decoded.kind === 'invalid') return;
    expect(() =>
      processInboundEventContract.input.encode({
        ...decoded.value,
        eventId: 'not-a-uuid',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'ingress_webhook_event_ready_invalid',
      }),
    );
  });

  it.each([
    { ...serialized, undeclared: true },
    { ...serialized, workerId: 'worker-1' },
    { ...serialized, attempt: 2 },
    { ...serialized, recoveredLease: true },
    { ...serialized, eventId: 'not-a-uuid' },
    { ...serialized, attempt: 0 },
    { ...serialized, receivedAt: 'not-a-date' },
  ])('rejects an invalid claimed delivery %#', (input) => {
    expect(processInboundEventContract.input.decode(input).kind).toBe(
      'invalid',
    );
  });

  it('round-trips acknowledged output and both expected failure classes', () => {
    expect(
      processInboundEventContract.output.decode(
        processInboundEventContract.output.encode({ acknowledged: true }),
      ),
    ).toEqual({ kind: 'valid', value: { acknowledged: true } });

    const permanent = {
      kind: 'validation',
      classification: 'stored_event',
      code: 'cents_order_payload_invalid',
      message: 'The stored Cents order payload is invalid.',
      safeMessage: 'The stored Cents order payload is invalid.',
      status: 422,
      retryable: false,
    } as const;
    const retryable = {
      kind: 'external_service',
      code: 'production_projection_pending',
      message:
        'The accepted fulfillment has not been projected into Production yet.',
      safeMessage:
        'The accepted fulfillment is waiting for its Production projection.',
      status: 503,
      retryable: true,
    } as const;
    for (const failure of [permanent, retryable])
      expect(
        processInboundEventContract.failure.decode(
          processInboundEventContract.failure.encode(failure),
        ),
      ).toEqual({ kind: 'valid', value: failure });
  });

  it('owns one internal ready-event message version', () => {
    expect(webhookEventReadyV1MessageContract).toMatchObject({
      id: 'ingress.webhook-event-ready.v1',
      type: 'ingress.webhook-event-ready',
      version: 1,
      scope: 'internal',
    });
    expect(webhookEventReadyV1MessageContract.payload).toBe(
      processInboundEventContract.input,
    );
  });
});
