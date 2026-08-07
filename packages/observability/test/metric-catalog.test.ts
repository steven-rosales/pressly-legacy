import { describe, expect, it } from 'vitest';
import { metricCatalog } from '../src/metric-catalog.js';

describe('metric catalog', () => {
  it('defines the new transaction and worker instruments explicitly', () => {
    expect(metricCatalog['db.transactions']).toMatchObject({
      instrument: 'counter',
      unit: 'count',
    });
    expect(metricCatalog['db.transaction_duration_seconds']).toMatchObject({
      instrument: 'distribution',
      unit: 'second',
    });
    expect(metricCatalog['worker.job_passes']).toMatchObject({
      instrument: 'counter',
      unit: 'count',
    });
    expect(metricCatalog['worker.job_pass_duration_seconds']).toMatchObject({
      instrument: 'distribution',
      unit: 'second',
    });
    expect(metricCatalog['worker.outbox_pending_count']).toMatchObject({
      instrument: 'gauge',
      unit: 'count',
    });
    expect(
      metricCatalog['worker.outbox_oldest_pending_age_seconds'],
    ).toMatchObject({
      instrument: 'gauge',
      unit: 'second',
    });
  });

  it('closes transaction and worker-pass outcomes to finite vocabularies', () => {
    expect(metricCatalog['db.transactions'].attributeValues?.outcome).toEqual([
      'committed',
      'expected_rollback',
      'failed',
    ]);
    expect(metricCatalog['worker.job_passes'].attributeValues?.outcome).toEqual(
      ['busy', 'idle', 'failed'],
    );
    expect(metricCatalog['db.transactions'].attributeValues?.operation).toEqual(
      expect.arrayContaining([
        'orders.correct_order',
        'production.advance_stage',
        'identity.confirm_mfa_enrollment',
      ]),
    );
    expect(metricCatalog['worker.job_passes'].attributeValues?.job).toEqual([
      'webhook_ingestion',
      'order_outbox',
    ]);
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

    for (const definition of Object.values(metricCatalog))
      expect(definition.allowedAttributes).not.toEqual(
        expect.arrayContaining(forbidden),
      );
  });
});
