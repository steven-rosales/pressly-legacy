import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { installIngressPostgresFixture } from '../../../testing/postgres-fixture.ts';
import { reconcileSourceLocationBindingsCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();
const binding = {
  source: 'cents',
  externalLocationId: 'store-1',
  locationId: 'location-1',
  isActive: true,
} as const;

proveOperation({
  operationId: 'ingress.reconcile-source-location-bindings.v1',
  declaration: reconcileSourceLocationBindingsCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits additions while dry-run and exact replay stay write-free',
      proves: [
        'contract',
        'executor-success',
        'postgres-commit',
        'same-payload-replay',
      ],
      run: async () => {
        expect(reconcileSourceLocationBindingsCellDeclaration).toMatchObject({
          id: 'ingress.reconcile-source-location-bindings.v1',
          consistency: { transaction: 'required', concurrency: 'none' },
          emits: [],
        });
        const cell = fixture.makeSystem().cells.reconcileSourceLocationBindings;
        const manifest = { sourceLocationBindings: [binding] };
        expect(await cell.execute({ manifest, dryRun: true })).toMatchObject({
          kind: 'success',
          value: { mode: 'dry_run', applied: false, status: 'converged' },
        });
        expect(
          await fixture.db.select().from(fixture.schema.sourceLocationBindings),
        ).toEqual([]);
        expect(await cell.execute({ manifest, dryRun: false })).toMatchObject({
          kind: 'success',
          value: { mode: 'apply', applied: true, status: 'converged' },
        });
        expect(await cell.execute({ manifest, dryRun: false })).toMatchObject({
          kind: 'success',
          value: {
            status: 'converged',
            operations: [
              {
                source: binding.source,
                externalLocationId: binding.externalLocationId,
                locationId: binding.locationId,
                outcome: 'noop',
              },
            ],
          },
        });
        expect(
          await fixture.db.select().from(fixture.schema.sourceLocationBindings),
        ).toHaveLength(1);
      },
    },

    {
      name: 'decides reassignment and removal rejections before writes',
      proves: [
        'decision',
        'divergent-key-conflict',
        'expected-rejection-no-partial-write',
      ],
      run: async () => {
        await fixture.insertBinding(binding);
        await fixture.insertBinding({
          source: 'cents',
          externalLocationId: 'store-2',
        });
        const cell = fixture.makeSystem().cells.reconcileSourceLocationBindings;
        const reassignment = await cell.execute({
          manifest: {
            sourceLocationBindings: [{ ...binding, locationId: 'location-2' }],
          },
          dryRun: false,
        });
        expect(reassignment).toMatchObject({
          kind: 'success',
          value: {
            applied: false,
            status: 'rejected',
            rejections: [{ code: 'binding_location_change' }],
          },
        });
        expect(
          await cell.execute({
            manifest: { sourceLocationBindings: [binding] },
            dryRun: false,
          }),
        ).toMatchObject({
          kind: 'success',
          value: {
            applied: false,
            status: 'rejected',
            rejections: [{ code: 'binding_removal' }],
          },
        });
        const rows = await fixture.db
          .select()
          .from(fixture.schema.sourceLocationBindings);
        expect(rows).toHaveLength(2);
        expect(
          rows.find((row) => row.externalLocationId === 'store-1'),
        ).toMatchObject(binding);
      },
    },

    {
      name: 'rolls back all additions when an owner-local binding key conflicts',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        const cell = fixture.makeSystem().cells.reconcileSourceLocationBindings;
        await expect(
          cell.execute({
            manifest: {
              sourceLocationBindings: [
                binding,
                {
                  ...binding,
                  locationId: 'location-2',
                },
              ],
            },
            dryRun: false,
          }),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'source_location_bindings_failed',
        });
        expect(
          await fixture.db.select().from(fixture.schema.sourceLocationBindings),
        ).toEqual([]);
      },
    },

    {
      name: 'serializes a divergent binding race without reassignment',
      proves: ['same-key-concurrency'],
      run: async () => {
        const cell = fixture.makeSystem().cells.reconcileSourceLocationBindings;
        const outcomes = await Promise.allSettled([
          cell.execute({
            manifest: { sourceLocationBindings: [binding] },
            dryRun: false,
          }),
          cell.execute({
            manifest: {
              sourceLocationBindings: [
                { ...binding, locationId: 'location-2' },
              ],
            },
            dryRun: false,
          }),
        ]);
        expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(
          true,
        );
        const rows = await fixture.db
          .select()
          .from(fixture.schema.sourceLocationBindings);
        expect(rows).toHaveLength(1);
        expect(['location-1', 'location-2']).toContain(rows[0]?.locationId);
      },
    },

    {
      name: 'rolls back unavailable reconciliation persistence',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        const cell = fixture.makeSystem().cells.reconcileSourceLocationBindings;
        await expect(
          fixture.withUnavailableTable('source_location_bindings', () =>
            cell.execute({
              manifest: { sourceLocationBindings: [binding] },
              dryRun: false,
            }),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'source_location_bindings_failed',
        });
        expect(
          await fixture.db.select().from(fixture.schema.sourceLocationBindings),
        ).toEqual([]);
      },
    },
  ],
});
