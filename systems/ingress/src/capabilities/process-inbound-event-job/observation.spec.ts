import { describe, expect, it, vi } from 'vitest';
import {
  observeProcessInboundEventRegistration,
  type ObservableJobRegistration,
} from './observation.ts';

const registration = (
  invoke: ObservableJobRegistration['invoke'],
): ObservableJobRegistration => ({
  operationId: 'ingress.process-inbound-event.v1',
  observability: 'ingress.process_inbound_event',
  jobId: 'ingress.process-inbound-event-job.v1',
  trigger: 'message',
  queue: 'webhook_ingestion',
  timeoutMs: null,
  retry: {
    maxAttempts: 8,
    strategy: 'bounded-exponential-jitter',
    deadLetter: 'retain',
  },
  invoke,
});

describe('process-inbound-event registration observation', () => {
  it('measures the actual invocation and preserves its manifest', async () => {
    const invoke = vi.fn<ObservableJobRegistration['invoke']>(async () => ({
      kind: 'complete',
    }));
    const times = [1_000, 1_250];
    const observe = vi.fn();
    const wrapped = observeProcessInboundEventRegistration({
      registration: registration(invoke),
      clock: { now: () => new Date(times.shift() ?? 1_250) },
      measurements: { observe },
    });
    const signal = new AbortController().signal;
    const payload = { source: 'cents', eventId: 'event-1' };

    await expect(wrapped.invoke(payload, signal)).resolves.toEqual({
      kind: 'complete',
    });
    expect(invoke).toHaveBeenCalledWith(payload, signal);
    expect(wrapped).toMatchObject({
      operationId: 'ingress.process-inbound-event.v1',
      jobId: 'ingress.process-inbound-event-job.v1',
      queue: 'webhook_ingestion',
      retry: { maxAttempts: 8 },
    });
    expect(observe).toHaveBeenCalledWith(
      'worker.processing_latency_seconds',
      0.25,
      { job: 'webhook_ingestion', source: 'cents' },
    );
  });

  it('measures rejected invocations without replacing their failure', async () => {
    const failure = { fault: 'invocation unavailable' };
    const observe = vi.fn(() => {
      throw { fault: 'measurement unavailable' };
    });
    const wrapped = observeProcessInboundEventRegistration({
      registration: registration(async () => Promise.reject(failure)),
      clock: {
        now: vi
          .fn<() => Date>()
          .mockReturnValueOnce(new Date(2_000))
          .mockReturnValue(new Date(2_100)),
      },
      measurements: { observe },
    });

    await expect(
      wrapped.invoke({ source: 'cents' }, new AbortController().signal),
    ).rejects.toBe(failure);
    expect(observe).toHaveBeenCalledWith(
      'worker.processing_latency_seconds',
      0.1,
      { job: 'webhook_ingestion', source: 'cents' },
    );
  });
});
