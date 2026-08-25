import { describe, expect, it } from 'vitest';
import {
  ingressMetricDescriptors,
  ingressMetricSources,
  ingressWorkerJobNames,
} from './metrics.ts';

describe('Ingress metric ownership', () => {
  it('owns durable inbox and webhook boundary descriptors', () => {
    expect(ingressMetricDescriptors.map(({ name }) => name)).toEqual([
      'worker.inbox_receipts',
      'worker.inbox_oldest_pending_age_seconds',
      'worker.inbox_pending_count',
      'worker.processing_latency_seconds',
      'api.webhook_rejections',
    ]);
    expect(new Set(ingressMetricDescriptors.map(({ name }) => name)).size).toBe(
      ingressMetricDescriptors.length,
    );
  });

  it('publishes the exact finite source and job vocabularies', () => {
    expect(ingressMetricSources).toEqual(['cents']);
    expect(ingressWorkerJobNames).toEqual(['webhook_ingestion']);

    for (const descriptor of ingressMetricDescriptors) {
      const allowedAttributes =
        descriptor.allowedAttributes as readonly string[];
      const attributeValues = descriptor.attributeValues as Readonly<
        Partial<Record<string, readonly string[]>>
      >;
      if (allowedAttributes.includes('source'))
        expect(attributeValues['source']).toEqual(['cents']);
      if (allowedAttributes.includes('job'))
        expect(attributeValues['job']).toEqual(['webhook_ingestion']);
      expect(descriptor.allowedAttributes).not.toEqual(
        expect.arrayContaining([
          'customer_id',
          'order_id',
          'request_id',
          'payload',
          'exception_message',
        ]),
      );
    }
  });
});
