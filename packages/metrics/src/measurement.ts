export type MeasurementName =
  | 'api.http_request_duration_seconds'
  | 'api.sse_active_connections'
  | 'worker.inbox_oldest_pending_age_seconds'
  | 'worker.inbox_pending_count'
  | 'worker.processing_latency_seconds'
  | 'worker.reconciliation_lag_seconds';

export type MeasurementLabels = Readonly<Record<string, string>>;

export type MeasurementSink = Readonly<{
  observe: (
    name: MeasurementName,
    value: number,
    labels?: MeasurementLabels,
  ) => void;
}>;

export const nullMeasurementSink: MeasurementSink = {
  observe: () => undefined,
};
