import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  ingressPostgresNow,
  ingressPostgresUuid,
  installIngressPostgresFixture,
} from '../../../testing/postgres-fixture.ts';
import { claimEventsCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();
const command = { workerId: 'worker-1', leaseMs: 30_000, limit: 10 };

proveOperation({
  operationId: 'ingress.claim-events.v1',
  declaration: claimEventsCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits receipt-ordered lease claims',
      proves: ['contract', 'executor-success', 'postgres-commit'],
      run: async () => {
        expect(claimEventsCellDeclaration).toMatchObject({
          id: 'ingress.claim-events.v1',
          consistency: { transaction: 'required', concurrency: 'partitioned' },
          idempotency: { required: false },
          emits: [],
        });
        await fixture.insertEvent({
          id: ingressPostgresUuid(1),
          receivedAt: new Date('2026-08-22T15:02:00.000Z'),
        });
        await fixture.insertEvent({
          id: ingressPostgresUuid(2),
          receivedAt: new Date('2026-08-22T15:01:00.000Z'),
        });
        const result = await fixture
          .makeSystem()
          .cells.claimEvents.execute(command);
        expect(result).toMatchObject({
          kind: 'success',
          value: [
            { eventId: ingressPostgresUuid(2), attempt: 1 },
            { eventId: ingressPostgresUuid(1), attempt: 1 },
          ],
        });
        const replay = await fixture
          .makeSystem()
          .cells.claimEvents.execute(command);
        expect(replay).toEqual({ kind: 'success', value: [] });
      },
    },

    {
      name: 'rejects an active lease without a partial claim',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await fixture.insertEvent({
          id: ingressPostgresUuid(10),
          status: 'processing',
          attempts: 2,
          leaseOwner: 'crashed-worker',
          leaseExpiresAt: new Date(ingressPostgresNow.getTime() - 1),
        });
        await fixture.insertEvent({
          id: ingressPostgresUuid(11),
          status: 'processing',
          attempts: 1,
          leaseOwner: 'active-worker',
          leaseExpiresAt: new Date(ingressPostgresNow.getTime() + 30_000),
        });
        const result = await fixture
          .makeSystem()
          .cells.claimEvents.execute(command);
        expect(result).toEqual({
          kind: 'success',
          value: [
            expect.objectContaining({
              eventId: ingressPostgresUuid(10),
              attempt: 3,
              recoveredLease: true,
            }),
          ],
        });
      },
    },

    {
      name: 'uses SKIP LOCKED for a two-worker race',
      proves: ['declared-concurrency-race'],
      run: async () => {
        await fixture.insertEvent({ id: ingressPostgresUuid(20) });
        await fixture.insertEvent({ id: ingressPostgresUuid(21) });
        const cell = fixture.makeSystem().cells.claimEvents;
        const [left, right] = await Promise.all([
          cell.execute({ ...command, workerId: 'left', limit: 1 }),
          cell.execute({ ...command, workerId: 'right', limit: 1 }),
        ]);
        const claims = [left, right].flatMap((result) =>
          result.kind === 'success' ? result.value : [],
        );
        expect(claims).toHaveLength(2);
        expect(new Set(claims.map(({ eventId }) => eventId)).size).toBe(2);
        expect(new Set(claims.map(({ workerId }) => workerId))).toEqual(
          new Set(['left', 'right']),
        );
      },
    },

    {
      name: 'rolls back the full claim batch on inconsistent stored payload',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await fixture.insertEvent({
          id: ingressPostgresUuid(30),
          receivedAt: new Date('2026-08-22T15:00:00.000Z'),
        });
        await fixture.insertEvent({
          id: ingressPostgresUuid(31),
          payload: null,
          payloadHash: null,
          receivedAt: new Date('2026-08-22T15:01:00.000Z'),
        });
        await expect(
          fixture
            .makeSystem()
            .cells.claimEvents.execute({ ...command, limit: 2 }),
        ).rejects.toMatchObject({
          kind: 'InvariantViolationError',
          code: 'webhook_claimable_event_payload_missing',
        });
        const rows = await fixture.db
          .select()
          .from(fixture.schema.webhookEvents);
        expect(rows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: ingressPostgresUuid(30),
              status: 'pending',
              attempts: 0,
              leaseOwner: null,
            }),
            expect.objectContaining({
              id: ingressPostgresUuid(31),
              status: 'pending',
              attempts: 0,
              leaseOwner: null,
            }),
          ]),
        );
      },
    },

    {
      name: 'maps unavailable claim persistence without changing state',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await fixture.insertEvent({ id: ingressPostgresUuid(40) });
        const cell = fixture.makeSystem().cells.claimEvents;
        await expect(
          fixture.withUnavailableTable('webhook_events', () =>
            cell.execute(command),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'webhook_event_claim_failed',
        });
        const [stored] = await fixture.db
          .select()
          .from(fixture.schema.webhookEvents);
        expect(stored).toMatchObject({
          id: ingressPostgresUuid(40),
          status: 'pending',
          attempts: 0,
        });
      },
    },
  ],
});
