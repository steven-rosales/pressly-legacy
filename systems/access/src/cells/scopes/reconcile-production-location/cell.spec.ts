import { proveOperation } from '@pressly/testkit/operation-proof';
import { unexpectedError } from '@pressly/errors/factories';
import { expect, vi } from 'vitest';
import {
  makeReconcileProductionLocationCell,
  reconcileProductionLocationCellDeclaration,
} from './cell.ts';

const location = Object.freeze({
  id: 'location-east',
  businessId: '86000000-0000-4000-8000-000000000001',
  name: 'East',
  timezone: 'America/New_York',
  isActive: true,
});

proveOperation({
  operationId: 'access.reconcile-production-location.v1',
  declaration: reconcileProductionLocationCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'creates the owner-local location through the declared transaction',
      proves: ['contract', 'decision', 'executor-success'],
      run: async () => {
        const save = vi.fn(async () => undefined);
        const cell = makeReconcileProductionLocationCell({
          repository: {
            transaction: async (work) =>
              work({
                lock: async () => undefined,
                load: async () => ({ businessExists: true, stored: null }),
                save,
              }),
          },
          clock: { now: () => new Date('2026-08-24T12:00:00.000Z') },
        });

        await expect(
          cell.execute({ location, dryRun: false }),
        ).resolves.toMatchObject({
          kind: 'success',
          value: {
            status: 'converged',
            applied: true,
            operation: { outcome: 'created' },
          },
        });
        expect(save).toHaveBeenCalledOnce();
      },
    },
    {
      name: 'rejects ownership changes without a partial write',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const save = vi.fn(async () => undefined);
        const cell = makeReconcileProductionLocationCell({
          repository: {
            transaction: async (work) =>
              work({
                lock: async () => undefined,
                load: async () => ({
                  businessExists: true,
                  stored: {
                    ...location,
                    businessId: '86000000-0000-4000-8000-000000000002',
                  },
                }),
                save,
              }),
          },
          clock: { now: () => new Date('2026-08-24T12:00:00.000Z') },
        });

        await expect(
          cell.execute({ location, dryRun: false }),
        ).resolves.toMatchObject({
          kind: 'success',
          value: {
            status: 'rejected',
            applied: false,
            rejections: [{ code: 'natural_key_change' }],
          },
        });
        expect(save).not.toHaveBeenCalled();
      },
    },
    {
      name: 'rolls back a staged location after an unexpected transaction failure',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        const cell = makeReconcileProductionLocationCell({
          repository: {
            transaction: async (work) => {
              let staged = false;
              await work({
                lock: async () => undefined,
                load: async () => ({ businessExists: true, stored: null }),
                save: async () => {
                  staged = true;
                },
              });
              expect(staged).toBe(true);
              throw unexpectedError({
                code: 'access_location_forced_rollback',
                message: 'Forced rollback test fixture.',
              });
            },
          },
          clock: { now: () => new Date('2026-08-24T12:00:00.000Z') },
        });

        await expect(
          cell.execute({ location, dryRun: false }),
        ).rejects.toMatchObject({
          code: 'access_location_forced_rollback',
        });
      },
    },
  ],
});
