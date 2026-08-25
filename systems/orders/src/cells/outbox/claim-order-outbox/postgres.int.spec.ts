import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  claimOrderOutboxCellDeclaration,
  makeClaimOrderOutboxCell,
} from './cell.ts';
import { makeClaimOrderOutboxPostgresRepository } from './postgres.ts';
import {
  insertOrdersPostgresProofEvent,
  ordersPostgresProofClock,
  ordersPostgresProofDatabase,
  ordersPostgresProofNow,
  ordersPostgresProofPayload,
  readOrdersPostgresProofEvents,
  seedOrdersPostgresCanonicalOrder,
  useOrdersPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { ordersTestSchema } from '../../../testing/schema.ts';

useOrdersPostgresProof('claim-order-outbox');

const claimCell = (workerId = 'worker-1') => ({
  workerId,
  cell: makeClaimOrderOutboxCell({
    repo: makeClaimOrderOutboxPostgresRepository({
      db: ordersPostgresProofDatabase.db,
      schema: ordersTestSchema,
    }),
    clock: ordersPostgresProofClock,
  }),
});

proveOperation({
  operationId: 'orders.claim-order-outbox.v1',
  declaration: claimOrderOutboxCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'claims only ready pending and expired-processing rows in a bounded batch',
      proves: ['postgres-commit'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const first = await insertOrdersPostgresProofEvent({
          index: 20,
          version: 1,
          availableAt: new Date('2026-08-22T15:55:00.000Z'),
        });
        const expired = await insertOrdersPostgresProofEvent({
          index: 21,
          version: 2,
          status: 'processing',
          attempts: 4,
          leaseOwner: 'worker-stale',
          leaseExpiresAt: ordersPostgresProofNow,
        });
        await insertOrdersPostgresProofEvent({
          index: 22,
          version: 3,
          availableAt: new Date('2026-08-22T16:00:00.001Z'),
        });
        const claim = claimCell();
        const outcome = await claim.cell.execute({
          workerId: claim.workerId,
          limit: 2,
          leaseMs: 30_000,
        });
        expect(outcome.kind).toBe('success');
        if (outcome.kind === 'failure') return;
        expect(outcome.value.map(({ id }) => id)).toEqual([first, expired]);
        expect(outcome.value.map(({ attempts }) => attempts)).toEqual([1, 5]);
      },
    },
    {
      name: 'lets two workers claim disjoint batches under SKIP LOCKED',
      proves: ['declared-concurrency-race'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        for (let index = 30; index < 36; index += 1)
          await insertOrdersPostgresProofEvent({
            index,
            version: index - 29,
            availableAt: new Date(ordersPostgresProofNow.getTime() - 1_000),
          });
        const first = claimCell('worker-a');
        const second = claimCell('worker-b');
        const [firstOutcome, secondOutcome] = await Promise.all([
          first.cell.execute({
            workerId: first.workerId,
            limit: 3,
            leaseMs: 30_000,
          }),
          second.cell.execute({
            workerId: second.workerId,
            limit: 3,
            leaseMs: 30_000,
          }),
        ]);
        expect(firstOutcome.kind).toBe('success');
        expect(secondOutcome.kind).toBe('success');
        if (firstOutcome.kind === 'failure' || secondOutcome.kind === 'failure')
          return;
        const firstIds = new Set(firstOutcome.value.map(({ id }) => id));
        const secondIds = new Set(secondOutcome.value.map(({ id }) => id));
        expect([...firstIds].filter((id) => secondIds.has(id))).toEqual([]);
        expect(new Set([...firstIds, ...secondIds]).size).toBe(6);
      },
    },
    {
      name: 'rejects an invalid claim before acquiring or mutating any lease',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        await insertOrdersPostgresProofEvent({ index: 39, version: 1 });
        const before = await readOrdersPostgresProofEvents();
        const claim = claimCell();
        await expect(
          claim.cell.execute({
            workerId: claim.workerId,
            limit: 0,
            leaseMs: 30_000,
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'order_outbox_claim_invalid' },
        });
        expect(await readOrdersPostgresProofEvents()).toEqual(before);
      },
    },
    {
      name: 'retains malformed durable JSON as an explicitly invalid claimed delivery',
      proves: ['protocol', 'message-compatibility'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const id = await insertOrdersPostgresProofEvent({
          index: 40,
          version: 1,
          storedPayload: {
            ...ordersPostgresProofPayload(1),
            dueAt: 'not-a-date',
          },
        });
        const claim = claimCell();
        await expect(
          claim.cell.execute({
            workerId: claim.workerId,
            limit: 10,
            leaseMs: 30_000,
          }),
        ).resolves.toMatchObject({
          kind: 'success',
          value: [{ id, kind: 'invalid', validationError: 'invalid_payload' }],
        });
        await expect(readOrdersPostgresProofEvents()).resolves.toMatchObject([
          { id, status: 'processing', attempts: 1, leaseOwner: 'worker-1' },
        ]);
      },
    },
    {
      name: 'rolls back every acquired lease when durable row mapping throws',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        await insertOrdersPostgresProofEvent({ index: 50, version: 1 });
        await insertOrdersPostgresProofEvent({ index: 51, version: 2 });
        const before = await readOrdersPostgresProofEvents();
        let mapped = 0;
        const cell = makeClaimOrderOutboxCell({
          repo: makeClaimOrderOutboxPostgresRepository({
            db: ordersPostgresProofDatabase.db,
            schema: ordersTestSchema,
            mapClaimedEvent: (row, lease) => {
              mapped += 1;
              if (mapped === 2) throw { fault: 'mapper fault' };
              return {
                id: row.id,
                orderId: row.orderId,
                fulfillmentId: row.fulfillmentId,
                aggregateVersion: row.aggregateVersion,
                attempts: row.attempts,
                leaseOwner: lease.owner,
                leaseExpiresAt: lease.expiresAt,
                kind: 'invalid',
                eventType: row.eventType,
                payload: {},
                validationError: 'invalid_payload',
              };
            },
          }),
          clock: ordersPostgresProofClock,
        });
        await expect(
          cell.execute({ workerId: 'worker-1', limit: 10, leaseMs: 30_000 }),
        ).rejects.toMatchObject({ code: 'order_outbox_claim_failed' });
        expect(await readOrdersPostgresProofEvents()).toEqual(before);
      },
    },
  ],
});
