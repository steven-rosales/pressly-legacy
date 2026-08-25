import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  ingressPostgresUuid,
  installIngressPostgresFixture,
} from '../../../testing/postgres-fixture.ts';
import { listDeadEventsCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();

proveOperation({
  operationId: 'ingress.list-dead-events.v1',
  declaration: listDeadEventsCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'reads bounded private-safe protocol metadata',
      proves: ['contract', 'executor-success', 'protocol'],
      run: async () => {
        expect(listDeadEventsCellDeclaration).toMatchObject({
          id: 'ingress.list-dead-events.v1',
          kind: 'query',
          consistency: { transaction: 'none', concurrency: 'none' },
        });
        await fixture.insertEvent({
          id: ingressPostgresUuid(500),
          status: 'dead',
          attempts: 8,
          lastErrorCode: 'projection_failed',
          lastErrorMessage: 'private diagnostic',
        });
        await fixture.insertEvent({
          id: ingressPostgresUuid(501),
          status: 'dead',
        });
        const result = await fixture.makeSystem().cells.listDeadEvents.execute({
          source: 'cents',
          limit: 1,
        });
        expect(result).toMatchObject({
          kind: 'success',
          value: {
            items: [{ eventId: ingressPostgresUuid(500) }],
            nextEventId: ingressPostgresUuid(500),
            asOf: fixture.now(),
          },
        });
        const item =
          result.kind === 'success' ? result.value.items[0] : undefined;
        expect(item).not.toHaveProperty('payload');
        expect(item).not.toHaveProperty('lastErrorMessage');
      },
    },

    {
      name: 'maps an unavailable dead-event read without state change',
      proves: ['executor-success'],
      run: async () => {
        await fixture.insertEvent({
          id: ingressPostgresUuid(510),
          status: 'dead',
        });
        const cell = fixture.makeSystem().cells.listDeadEvents;
        await expect(
          fixture.withUnavailableTable('webhook_events', () =>
            cell.execute({ limit: 10 }),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'dead_webhook_event_list_failed',
        });
        expect(await fixture.readCounts()).toMatchObject({ events: 1 });
      },
    },
  ],
});
