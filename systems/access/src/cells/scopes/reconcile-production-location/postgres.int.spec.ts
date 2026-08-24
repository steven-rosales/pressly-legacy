import { eq } from '@pressly/postgres/query';
import { makeAggregateError } from '@pressly/errors/app-error';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { makeProductionLocationAuthority } from '../../../assembly/production-location-authority.ts';
import {
  accessPostgresProofBusinessId,
  accessPostgresProofDatabase,
  seedAccessPostgresScope,
  useAccessPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { accessTestSchema as accessPostgresProofSchema } from '../../../testing/schema.ts';
import {
  makeReconcileProductionLocationCell,
  reconcileProductionLocationCellDeclaration,
} from './cell.ts';
import { makeReconcileProductionLocationPostgresRepository } from './postgres.ts';

useAccessPostgresProof();

proveOperation({
  operationId: 'access.reconcile-production-location.v1',
  declaration: reconcileProductionLocationCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits the canonical Access location without touching a peer owner',
      proves: ['postgres-commit', 'declared-concurrency-race'],
      run: async () => {
        await seedAccessPostgresScope();
        const cell = makeProductionLocationAuthority({
          db: accessPostgresProofDatabase.db,
          schema: accessPostgresProofSchema,
          clock: { now: () => new Date('2026-08-24T12:00:00.000Z') },
        });

        const command = {
          location: {
            id: 'access-proof-east',
            businessId: accessPostgresProofBusinessId,
            name: 'Access Proof East',
            timezone: 'America/New_York',
            isActive: true,
          },
          dryRun: false,
        } as const;
        const outcomes = await Promise.all([
          cell.execute(command),
          cell.execute(command),
        ]);
        expect(
          outcomes.map((outcome) =>
            outcome.kind === 'success'
              ? outcome.value.operation?.outcome
              : 'failure',
          ),
        ).toEqual(expect.arrayContaining(['created', 'noop']));
        await expect(
          accessPostgresProofDatabase.db
            .select({
              id: accessPostgresProofSchema.accessProductionLocations.id,
              name: accessPostgresProofSchema.accessProductionLocations.name,
            })
            .from(accessPostgresProofSchema.accessProductionLocations)
            .where(
              eq(
                accessPostgresProofSchema.accessProductionLocations.id,
                'access-proof-east',
              ),
            ),
        ).resolves.toEqual([
          { id: 'access-proof-east', name: 'Access Proof East' },
        ]);
      },
    },
    {
      name: 'keeps a dry-run free of writes',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedAccessPostgresScope();
        const cell = makeProductionLocationAuthority({
          db: accessPostgresProofDatabase.db,
          schema: accessPostgresProofSchema,
          clock: { now: () => new Date('2026-08-24T12:00:00.000Z') },
        });
        await cell.execute({
          location: {
            id: 'access-proof-dry-run',
            businessId: accessPostgresProofBusinessId,
            name: 'Dry Run',
            timezone: 'UTC',
            isActive: true,
          },
          dryRun: true,
        });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.accessProductionLocations)
            .where(
              eq(
                accessPostgresProofSchema.accessProductionLocations.id,
                'access-proof-dry-run',
              ),
            ),
        ).resolves.toHaveLength(0);
      },
    },
    {
      name: 'rolls back the owner-local row after a forced late failure',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await seedAccessPostgresScope();
        const repository = makeReconcileProductionLocationPostgresRepository(
          accessPostgresProofDatabase.db,
          accessPostgresProofSchema,
        );
        const cell = makeReconcileProductionLocationCell({
          repository: {
            transaction: (work) =>
              repository.transaction(async (transaction) => {
                await work(transaction);
                throw makeAggregateError({
                  errors: ['forced-late-failure-test-fixture'],
                  message: 'Forced late failure test fixture.',
                });
              }),
          },
          clock: { now: () => new Date('2026-08-24T12:00:00.000Z') },
        });

        await expect(
          cell.execute({
            location: {
              id: 'access-proof-rollback',
              businessId: accessPostgresProofBusinessId,
              name: 'Rollback',
              timezone: 'UTC',
              isActive: true,
            },
            dryRun: false,
          }),
        ).rejects.toMatchObject({
          code: 'access_production_location_reconciliation_failed',
        });
        await expect(
          accessPostgresProofDatabase.db
            .select()
            .from(accessPostgresProofSchema.accessProductionLocations)
            .where(
              eq(
                accessPostgresProofSchema.accessProductionLocations.id,
                'access-proof-rollback',
              ),
            ),
        ).resolves.toHaveLength(0);
      },
    },
  ],
});
