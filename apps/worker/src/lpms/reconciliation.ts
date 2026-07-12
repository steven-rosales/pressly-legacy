import type { IngestWebhookEventCommand } from '@pressly/contracts';
import {
  nullCounterSink,
  nullMeasurementSink,
  type CounterSink,
  type MeasurementSink,
} from '@pressly/metrics';
import type { WebhookIngestionApplication } from '@pressly/webhook-ingestion';

export type CentsReconciliationPort = Readonly<{
  pullUpdatedOrders: (watermark: string | null) => Promise<
    | Readonly<{ supported: false }>
    | Readonly<{
        supported: true;
        events: readonly IngestWebhookEventCommand[];
        nextWatermark: string;
      }>
  >;
}>;

export const reconcileCentsOrders = async (input: {
  vendor: CentsReconciliationPort;
  ingestEvent: WebhookIngestionApplication['ingestEvent'];
  watermark: string | null;
  clock?: Readonly<{ now: () => Date }>;
  counters?: CounterSink;
  measurements?: MeasurementSink;
}) => {
  const counters = input.counters ?? nullCounterSink;
  const measurements = input.measurements ?? nullMeasurementSink;
  const pulled = await input.vendor.pullUpdatedOrders(input.watermark);
  if (!pulled.supported)
    return {
      supported: false as const,
      ingested: 0,
      watermark: input.watermark,
    };

  const newestEventAt = pulled.events.reduce<number | null>((latest, event) => {
    if (event.sourceOccurredAt === null) return latest;
    const occurredAt = Date.parse(event.sourceOccurredAt);
    if (!Number.isFinite(occurredAt)) return latest;
    return latest === null ? occurredAt : Math.max(latest, occurredAt);
  }, null);
  measurements.observe(
    'worker.reconciliation_lag_seconds',
    newestEventAt === null
      ? 0
      : Math.max(
          0,
          ((input.clock?.now() ?? new Date()).getTime() - newestEventAt) /
            1_000,
        ),
    { source: 'cents' },
  );

  let ingested = 0;
  let failed = false;
  for (const event of pulled.events) {
    const result = await input.ingestEvent(event);
    if (result.tag === 'ok') ingested += 1;
    else {
      failed = true;
      counters.increment('worker.reconciliation_drift', {
        source: 'cents',
        phase: 'ingestion',
      });
    }
  }

  return {
    supported: true as const,
    ingested,
    watermark: failed ? input.watermark : pulled.nextWatermark,
  };
};
