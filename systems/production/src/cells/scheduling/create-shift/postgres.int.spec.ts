import { proveOperation } from '@pressly/testkit/operation-proof';
import { createShiftCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { eq } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { createShiftContract } from './contract.ts';
import { makeExecuteCreateShift, type ExecuteCreateShift } from './execute.ts';
import { createShiftIdempotency } from './idempotency.ts';
import { makeCreateShiftPostgresRepository } from './postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: ['work_events', 'production_shifts', 'production_locations'],
  maxConnections: 4,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const ids = {
  actor: '21000000-0000-4000-8000-000000000001',
  shift: '21000000-0000-4000-8000-000000000002',
  event: '21000000-0000-4000-8000-000000000003',
  rollbackShift: '21000000-0000-4000-8000-000000000004',
  collisionEvent: '21000000-0000-4000-8000-000000000005',
} as const;

const locationId = 'location-create-shift';
const businessId = '00000000-0000-4000-8000-000000000100';

const seedLocation = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Create Shift Facility',
    timezone: 'America/New_York',
  });
};

const idSource = (...values: readonly string[]): IdSource => {
  let index = 0;
  return {
    next: () =>
      values[index++] ??
      `31000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
};

const makeExecute = (idsSource: IdSource): ExecuteCreateShift =>
  makeExecuteCreateShift({
    repo: makeCreateShiftPostgresRepository(
      {
        db: database.db,
        ids: idsSource,
      },
      productionTestSchema,
    ),
    idempotency: createShiftIdempotency,
    policy: productionRules,
    ids: idsSource,
  });

const serializedCommand = (
  overrides: {
    effectiveFolderCount?: number;
    idempotencyKey?: string;
  } = {},
) => ({
  params: { locationId },
  body: {
    startsAt: '2026-08-22T13:00:00.000Z',
    endsAt: '2026-08-22T21:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: overrides.effectiveFolderCount ?? 4,
    idempotencyKey:
      overrides.idempotencyKey ?? 'create-shift-command-postgres-1',
  },
  actorId: ids.actor,
});

const executeSerialized = async (
  execute: ExecuteCreateShift,
  serialized: ReturnType<typeof serializedCommand>,
) => {
  const decoded = createShiftContract.input.decode(serialized);
  if (decoded.kind === 'invalid') return decoded;
  const outcome = await execute(decoded.value);
  return outcome.kind === 'success'
    ? {
        kind: 'success' as const,
        value: createShiftContract.output.encode(outcome.value),
      }
    : {
        kind: 'failure' as const,
        failure: createShiftContract.failure.encode(outcome.failure),
      };
};

describe('create shift serialized native Postgres cell', () => {
  proveOperation({
    operationId: 'production.create-shift.v1',
    declaration: createShiftCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits the exact shift and receipt once, replays, and rejects divergent reuse',
        proves: [
          'postgres-commit',
          'same-payload-replay',
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seedLocation();
          const execute = makeExecute(idSource(ids.shift, ids.event));
          const request = serializedCommand();

          await expect(executeSerialized(execute, request)).resolves.toEqual({
            kind: 'success',
            value: {
              id: ids.shift,
              locationId,
              startsAt: '2026-08-22T13:00:00.000Z',
              endsAt: '2026-08-22T21:00:00.000Z',
              timezone: 'America/New_York',
              effectiveFolderCount: 4,
              status: 'open',
              version: 1,
            },
          });
          await expect(
            executeSerialized(execute, request),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { id: ids.shift, version: 1 },
          });
          await expect(
            executeSerialized(
              execute,
              serializedCommand({ effectiveFolderCount: 5 }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'production_idempotency_conflict',
            },
          });

          const shifts = await database.db
            .select()
            .from(productionTestSchema.productionShifts);
          expect(shifts).toHaveLength(1);
          expect(shifts[0]).toMatchObject({
            id: ids.shift,
            locationId,
            startsAt: new Date('2026-08-22T13:00:00.000Z'),
            endsAt: new Date('2026-08-22T21:00:00.000Z'),
            timezone: 'America/New_York',
            effectiveFolderCount: 4,
            status: 'open',
            version: 1,
          });

          const events = await database.db
            .select()
            .from(productionTestSchema.workEvents);
          expect(events).toEqual([
            expect.objectContaining({
              id: ids.event,
              locationId,
              eventType: 'production_shift_created',
              entityType: 'production_shift',
              entityId: ids.shift,
              actorId: ids.actor,
              expectedVersion: null,
              idempotencyKey: 'create-shift-command-postgres-1',
              payload: {
                startsAt: '2026-08-22T13:00:00.000Z',
                endsAt: '2026-08-22T21:00:00.000Z',
                _idempotency: {
                  version: 1,
                  command: {
                    operation: 'production_shift_created',
                    locationId,
                    actorId: ids.actor,
                    target: { entityType: 'production_shift', entityId: null },
                    expectedVersion: null,
                    payload: {
                      startsAt: '2026-08-22T13:00:00.000Z',
                      endsAt: '2026-08-22T21:00:00.000Z',
                      timezone: 'America/New_York',
                      effectiveFolderCount: 4,
                    },
                  },
                  result: {
                    id: ids.shift,
                    locationId,
                    startsAt: '2026-08-22T13:00:00.000Z',
                    endsAt: '2026-08-22T21:00:00.000Z',
                    timezone: 'America/New_York',
                    effectiveFolderCount: 4,
                    status: 'open',
                    version: 1,
                  },
                },
              },
            }),
          ]);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.create-shift.v1',
    declaration: createShiftCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back the shift when its receipt cannot be appended',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seedLocation();
          await database.db.insert(productionTestSchema.workEvents).values({
            id: ids.collisionEvent,
            locationId,
            eventType: 'fixture_event',
            entityType: 'fixture',
            entityId: ids.collisionEvent,
            actorId: ids.actor,
            expectedVersion: null,
            idempotencyKey: 'fixture-existing-event',
            payload: {},
          });
          const execute = makeExecute(
            idSource(ids.rollbackShift, ids.collisionEvent),
          );

          await expect(
            executeSerialized(
              execute,
              serializedCommand({ idempotencyKey: 'create-shift-rollback-1' }),
            ),
          ).rejects.toMatchObject({
            code: 'production_shift_create_failed',
            status: 503,
          });

          await expect(
            database.db
              .select()
              .from(productionTestSchema.productionShifts)
              .where(
                eq(productionTestSchema.productionShifts.id, ids.rollbackShift),
              ),
          ).resolves.toEqual([]);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.create-shift.v1',
    declaration: createShiftCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'collapses concurrent identical shift creation to one shift and receipt',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seedLocation();
          const request = serializedCommand({
            idempotencyKey: 'create-shift-same-key-race',
          });
          const outcomes = await Promise.all([
            executeSerialized(
              makeExecute(
                idSource(
                  '71000000-0000-4000-8000-000000000001',
                  '71000000-0000-4000-8000-000000000002',
                ),
              ),
              request,
            ),
            executeSerialized(
              makeExecute(
                idSource(
                  '72000000-0000-4000-8000-000000000001',
                  '72000000-0000-4000-8000-000000000002',
                ),
              ),
              request,
            ),
          ]);

          expect(outcomes.every((outcome) => outcome.kind === 'success')).toBe(
            true,
          );
          await expect(
            database.db.select().from(productionTestSchema.productionShifts),
          ).resolves.toHaveLength(1);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
    ],
  });
});
