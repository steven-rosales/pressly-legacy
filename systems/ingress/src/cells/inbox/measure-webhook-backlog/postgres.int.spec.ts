import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  ingressPostgresUuid,
  installIngressPostgresFixture,
} from '../../../testing/postgres-fixture.ts';
import { measureWebhookBacklogCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();

proveOperation({
  operationId: 'ingress.measure-webhook-backlog.v1',
  declaration: measureWebhookBacklogCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'reads pending plus processing backlog by oldest receipt',
      proves: ['contract', 'executor-success'],
      run: async () => {
        expect(measureWebhookBacklogCellDeclaration).toMatchObject({
          id: 'ingress.measure-webhook-backlog.v1',
          kind: 'query',
          consistency: { transaction: 'none', concurrency: 'none' },
        });
        await fixture.insertEvent({
          id: ingressPostgresUuid(520),
          status: 'pending',
          receivedAt: new Date(fixture.now().getTime() - 120_000),
        });
        await fixture.insertEvent({
          id: ingressPostgresUuid(521),
          status: 'processing',
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date(fixture.now().getTime() + 30_000),
          receivedAt: new Date(fixture.now().getTime() - 60_000),
        });
        await fixture.insertEvent({
          id: ingressPostgresUuid(522),
          status: 'dead',
        });
        expect(
          await fixture.makeSystem().cells.measureWebhookBacklog.execute({}),
        ).toEqual({
          kind: 'success',
          value: { pendingCount: 2, oldestPendingAgeSeconds: 120 },
        });
      },
    },

    {
      name: 'maps an unavailable backlog read without state change',
      proves: ['executor-success'],
      run: async () => {
        await fixture.insertEvent({ id: ingressPostgresUuid(530) });
        const cell = fixture.makeSystem().cells.measureWebhookBacklog;
        await expect(
          fixture.withUnavailableTable('webhook_events', () =>
            cell.execute({}),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'webhook_backlog_measurement_failed',
        });
        expect(await fixture.readCounts()).toMatchObject({ events: 1 });
      },
    },
  ],
});
