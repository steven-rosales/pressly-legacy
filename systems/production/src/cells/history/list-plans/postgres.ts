import type { ProductionScopeReconciliationV1Capability } from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, desc, eq, gte, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { historyPlansCursor } from './cursor.ts';
import { projectHistoryPlan } from './project.ts';
import type {
  ListHistoryPlansInput,
  ListHistoryPlansRepository,
} from './types.ts';

const planSelect = (schema: ProductionSchema) =>
  ({
    id: schema.scheduleRuns.id,
    productionShiftId: schema.scheduleRuns.productionShiftId,
    linkedProductionRunId: schema.productionRuns.id,
    status: schema.scheduleRuns.status,
    shiftStartsAt: schema.productionShifts.startsAt,
    shiftEndsAt: schema.productionShifts.endsAt,
    algorithmVersion: schema.scheduleRuns.algorithmVersion,
    schedulerConfigId: schema.scheduleRuns.schedulerConfigId,
    inputSnapshotHash: schema.scheduleRuns.inputSnapshotHash,
    outputPlanHash: schema.scheduleRuns.outputPlanHash,
    pulseCapacityLbs: schema.scheduleRuns.pulseCapacityLbs,
    batchCount: schema.scheduleRuns.batchCount,
    makespanMinutes: schema.scheduleRuns.makespanMinutes,
    plannedCompletionAt: schema.scheduleRuns.plannedCompletionAt,
    warnings: schema.scheduleRuns.warnings,
    acknowledgedWarningCodes: schema.scheduleRuns.acknowledgedWarningCodes,
    createdAt: schema.scheduleRuns.createdAt,
    cursorCreatedAtKey:
      sql<string>`to_char(${schema.scheduleRuns.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        'cursor_created_at_key',
      ),
    acceptedAt: schema.scheduleRuns.acceptedAt,
    acceptedBy: schema.scheduleRuns.acceptedBy,
    supersededAt: schema.scheduleRuns.supersededAt,
  }) as const;

const locationExists = async (
  locationId: string,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): Promise<boolean> =>
  (await productionScopeReconciliationV1.load({
    locationId,
  })) !== null;

const readHistoryPlans = async (
  database: PostgresExecutor,
  input: ListHistoryPlansInput,
  asOf: Date,
  schema: ProductionSchema,
) => {
  const cursor =
    input.cursor === undefined
      ? undefined
      : historyPlansCursor.decode(input.cursor, input);
  if (cursor === null) return { kind: 'invalid_cursor' as const };
  const rows = await database
    .select(planSelect(schema))
    .from(schema.scheduleRuns)
    .innerJoin(
      schema.productionShifts,
      and(
        eq(schema.productionShifts.id, schema.scheduleRuns.productionShiftId),
        eq(schema.productionShifts.locationId, schema.scheduleRuns.locationId),
      ),
    )
    .leftJoin(
      schema.productionRuns,
      and(
        eq(schema.productionRuns.scheduleRunId, schema.scheduleRuns.id),
        eq(schema.productionRuns.locationId, schema.scheduleRuns.locationId),
      ),
    )
    .where(
      and(
        eq(schema.scheduleRuns.locationId, input.locationId),
        input.runId === undefined
          ? undefined
          : eq(schema.productionRuns.id, input.runId),
        input.status === undefined
          ? undefined
          : eq(schema.scheduleRuns.status, input.status),
        input.createdAfter === undefined
          ? undefined
          : gte(schema.scheduleRuns.createdAt, input.createdAfter),
        input.search === undefined
          ? undefined
          : sql<boolean>`(
              strpos(lower(${schema.scheduleRuns.id}::text), lower(${input.search})) > 0
              or strpos(lower(${schema.scheduleRuns.productionShiftId}::text), lower(${input.search})) > 0
              or strpos(lower(${schema.scheduleRuns.schedulerConfigId}::text), lower(${input.search})) > 0
              or strpos(lower(coalesce(${schema.productionRuns.id}::text, '')), lower(${input.search})) > 0
              or strpos(lower(${schema.scheduleRuns.algorithmVersion}), lower(${input.search})) > 0
            )`,
        cursor === undefined
          ? undefined
          : sql<boolean>`(${schema.scheduleRuns.createdAt}, ${schema.scheduleRuns.id}) < (${cursor.createdAtKey}::timestamptz, ${cursor.id}::uuid)`,
      ),
    )
    .orderBy(desc(schema.scheduleRuns.createdAt), desc(schema.scheduleRuns.id))
    .limit(input.limit + 1);

  const hasNextPage = rows.length > input.limit;
  const pageRows = rows.slice(0, input.limit);
  const last = pageRows.at(-1);
  return {
    kind: 'found' as const,
    page: {
      items: pageRows.map(projectHistoryPlan),
      nextCursor:
        hasNextPage && last !== undefined
          ? historyPlansCursor.encode(input, {
              createdAtKey: last.cursorCreatedAtKey,
              id: last.id,
            })
          : null,
      asOf,
    },
  };
};

export const makeListHistoryPlansPostgresRepository = (
  database: PostgresDatabase,
  schema: ProductionSchema,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): ListHistoryPlansRepository => ({
  list: async (input, asOf) => {
    const cursor =
      input.cursor === undefined
        ? undefined
        : historyPlansCursor.decode(input.cursor, input);
    if (cursor === null) return { kind: 'invalid_cursor' };
    if (
      !(await locationExists(input.locationId, productionScopeReconciliationV1))
    )
      return { kind: 'location_not_found' };

    return database.transaction(
      (transaction) => readHistoryPlans(transaction, input, asOf, schema),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  },
});
