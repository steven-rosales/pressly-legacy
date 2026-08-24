export const ingressMetricSources = Object.freeze(['cents'] as const);
export const ingressWorkerJobNames = Object.freeze([
  'webhook_ingestion',
] as const);

export type IngressMetricName =
  | 'worker.inbox_receipts'
  | 'worker.inbox_oldest_pending_age_seconds'
  | 'worker.inbox_pending_count'
  | 'worker.processing_latency_seconds'
  | 'api.webhook_rejections';

type IngressMetricAttribute =
  | 'runtime'
  | 'job'
  | 'source'
  | 'reason'
  | 'status';

export type IngressMetricDescriptor = Readonly<{
  name: IngressMetricName;
  instrument: 'counter' | 'gauge' | 'distribution';
  unit: 'count' | 'second';
  allowedAttributes: readonly IngressMetricAttribute[];
  attributeValues?: Readonly<
    Partial<Record<IngressMetricAttribute, readonly string[]>>
  >;
}>;

export const ingressMetricDescriptors = Object.freeze([
  {
    name: 'worker.inbox_receipts',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'source'],
    attributeValues: { source: ingressMetricSources },
  },
  {
    name: 'worker.inbox_oldest_pending_age_seconds',
    instrument: 'gauge',
    unit: 'second',
    allowedAttributes: ['runtime', 'job'],
    attributeValues: { job: ingressWorkerJobNames },
  },
  {
    name: 'worker.inbox_pending_count',
    instrument: 'gauge',
    unit: 'count',
    allowedAttributes: ['runtime', 'job'],
    attributeValues: { job: ingressWorkerJobNames },
  },
  {
    name: 'worker.processing_latency_seconds',
    instrument: 'distribution',
    unit: 'second',
    allowedAttributes: ['runtime', 'job', 'source'],
    attributeValues: {
      job: ingressWorkerJobNames,
      source: ingressMetricSources,
    },
  },
  {
    name: 'api.webhook_rejections',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'source', 'reason', 'status'],
    attributeValues: { source: ingressMetricSources },
  },
] as const satisfies readonly IngressMetricDescriptor[]);
