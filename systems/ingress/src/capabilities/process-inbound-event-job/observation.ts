import type { JobTrigger, RetryManifest } from '@pressly/cells';
import type { JobInvocationOutcome } from '@pressly/jobs';
import {
  isolateMeasurementSink,
  type MeasurementSink,
} from '@pressly/observability';
import type { Clock } from '@pressly/time';
import type { WebhookEventReadyV1 } from '../../contracts/webhook-event-ready-v1.ts';

export type ObservableJobRegistration = Readonly<{
  operationId: string;
  observability: string;
  jobId: string;
  trigger: JobTrigger;
  queue: string | null;
  timeoutMs: number | null;
  retry: RetryManifest | null;
  invoke: (
    payload: unknown,
    signal: AbortSignal,
  ) => Promise<JobInvocationOutcome>;
}>;

const sourceFromPayload = (payload: unknown): WebhookEventReadyV1['source'] =>
  typeof payload === 'object' &&
  payload !== null &&
  'source' in payload &&
  typeof payload.source === 'string'
    ? payload.source
    : 'unknown';

export const observeProcessInboundEventRegistration = (input: {
  registration: ObservableJobRegistration;
  clock: Clock;
  measurements: MeasurementSink;
}): ObservableJobRegistration => {
  const { observe } = isolateMeasurementSink(input.measurements);

  return Object.freeze({
    ...input.registration,
    invoke: async (payload, signal) => {
      const startedAt = input.clock.now().getTime();
      try {
        return await input.registration.invoke(payload, signal);
      } finally {
        observe(
          'worker.processing_latency_seconds',
          Math.max(0, (input.clock.now().getTime() - startedAt) / 1_000),
          {
            job: 'webhook_ingestion',
            source: sourceFromPayload(payload),
          },
        );
      }
    },
  });
};
