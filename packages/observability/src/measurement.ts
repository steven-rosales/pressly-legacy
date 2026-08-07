export type MeasurementName =
  | 'api.http_request_duration_seconds'
  | 'api.sse_active_connections'
  | 'worker.inbox_oldest_pending_age_seconds'
  | 'worker.inbox_pending_count'
  | 'worker.processing_latency_seconds'
  | 'db.transaction_duration_seconds'
  | 'worker.job_pass_duration_seconds'
  | 'worker.outbox_pending_count'
  | 'worker.outbox_oldest_pending_age_seconds';

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
