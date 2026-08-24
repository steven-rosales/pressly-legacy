import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { genericMetricDescriptors } from '../src/metric-catalog.js';

describe('generic metric descriptors', () => {
  it('defines transaction, job-pass, HTTP, and SSE mechanisms', () => {
    const byName = new Map(
      genericMetricDescriptors.map((descriptor) => [
        descriptor.name,
        descriptor,
      ]),
    );

    expect(byName.get('db.transactions')).toMatchObject({
      instrument: 'counter',
      unit: 'count',
    });
    expect(byName.get('db.transaction_duration_seconds')).toMatchObject({
      instrument: 'distribution',
      unit: 'second',
    });
    expect(byName.get('worker.job_passes')).toMatchObject({
      instrument: 'counter',
      unit: 'count',
    });
    expect(byName.get('worker.job_pass_duration_seconds')).toMatchObject({
      instrument: 'distribution',
      unit: 'second',
    });
    const sseFailures = genericMetricDescriptors.find(
      (descriptor) => descriptor.name === 'api.sse_failures',
    );

    expect(sseFailures?.attributeValues.reason).toEqual([
      'invalid_frame',
      'session_close',
      'source_error',
      'write_error',
    ]);
  });

  it('keeps topology-owned operation and job vocabularies out of package descriptors', () => {
    const transaction = genericMetricDescriptors.find(
      (descriptor) => descriptor.name === 'db.transactions',
    );
    const jobPass = genericMetricDescriptors.find(
      (descriptor) => descriptor.name === 'worker.job_passes',
    );

    expect(transaction?.attributeValues).not.toHaveProperty('operation');
    expect(jobPass?.attributeValues).not.toHaveProperty('job');
  });

  it('never permits payload, identifier, SQL, or exception-message labels', () => {
    const forbidden = [
      'customer_id',
      'order_id',
      'request_id',
      'url',
      'sql',
      'parameters',
      'payload',
      'exception_message',
    ];

    for (const descriptor of genericMetricDescriptors)
      expect(descriptor.allowedAttributes).not.toEqual(
        expect.arrayContaining(forbidden),
      );
  });

  it('permanently rejects owner business vocabulary anywhere in package source', () => {
    const sourceRoot = resolve(import.meta.dirname, '../src');
    const source = readdirSync(sourceRoot)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => readFileSync(resolve(sourceRoot, name), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(
      /['"](?:production|orders|identity|ingress|customers|pricing)[._]/,
    );
    expect(source).not.toMatch(/['"](?:webhook_ingestion|order_outbox)['"]/);
    expect(source).not.toMatch(/['"]cents['"]/);
  });
});
