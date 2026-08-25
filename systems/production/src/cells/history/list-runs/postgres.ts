import type { ProductionScopeReconciliationV1Capability } from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, desc, eq, gte, inArray, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { historyRunsCursor } from './cursor.ts';
import { emptyHistoryRunStatistics, projectHistoryRun } from './project.ts';
import type {
  HistoryRunStatistics,
  ListHistoryRunsInput,
  ListHistoryRunsRepository,
} from './types.ts';

const runSelect = (schema: ProductionSchema) =>
  ({
    id: schema.productionRuns.id,
    productionShiftId: schema.productionRuns.productionShiftId,
    scheduleRunId: schema.productionRuns.scheduleRunId,
    status: schema.productionRuns.status,
    shiftStartsAt: schema.productionShifts.startsAt,
    shiftEndsAt: schema.productionShifts.endsAt,
    timezone: schema.productionShifts.timezone,
    startedAt: schema.productionRuns.startedAt,
    completedAt: schema.productionRuns.completedAt,
    plannedCompletionAt: schema.productionRuns.plannedCompletionAt,
    queueVersion: schema.productionRuns.queueVersion,
    overtimeAcknowledgedAt: schema.productionRuns.overtimeAcknowledgedAt,
    createdAt: schema.productionRuns.createdAt,
    cursorCreatedAtKey:
      sql<string>`to_char(${schema.productionRuns.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        'cursor_created_at_key',
      ),
  }) as const;

const locationExists = async (
  locationId: string,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): Promise<boolean> =>
  (await productionScopeReconciliationV1.load({
    locationId,
  })) !== null;

const loadStatistics = async (
  database: PostgresExecutor,
  runIds: readonly string[],
  schema: ProductionSchema,
): Promise<ReadonlyMap<string, HistoryRunStatistics>> => {
  if (runIds.length === 0) return new Map();
  const [batchRows, orderRows] = await Promise.all([
    database
      .select({
        productionRunId: schema.productionBatches.productionRunId,
        batchCount: sql<number>`count(*)`,
        completedBatchCount: sql<number>`count(*) filter (where ${schema.productionBatches.status} = 'finished')`,
        totalWeightLbs: sql<number>`coalesce(sum(${schema.productionBatches.derivedWeightLbs}), 0)`,
      })
      .from(schema.productionBatches)
      .where(inArray(schema.productionBatches.productionRunId, [...runIds]))
      .groupBy(schema.productionBatches.productionRunId),
    database
      .select({
        productionRunId: schema.productionBatches.productionRunId,
        orderCount: sql<number>`count(distinct ${schema.productionBatchOrders.productionOrderId})`,
        priorityOrderCount: sql<number>`count(distinct ${schema.productionBatchOrders.productionOrderId}) filter (where ${schema.productionOrders.priority} = true)`,
      })
      .from(schema.productionBatchOrders)
      .innerJoin(
        schema.productionBatches,
        and(
          eq(
            schema.productionBatches.id,
            schema.productionBatchOrders.productionBatchId,
          ),
          eq(
            schema.productionBatches.locationId,
            schema.productionBatchOrders.locationId,
          ),
        ),
      )
      .innerJoin(
        schema.productionOrders,
        and(
          eq(
            schema.productionOrders.id,
            schema.productionBatchOrders.productionOrderId,
          ),
          eq(
            schema.productionOrders.locationId,
            schema.productionBatchOrders.locationId,
          ),
        ),
      )
      .where(inArray(schema.productionBatches.productionRunId, [...runIds]))
      .groupBy(schema.productionBatches.productionRunId),
  ]);

  const statistics = new Map<string, HistoryRunStatistics>();
  for (const row of batchRows)
    statistics.set(row.productionRunId, {
      ...emptyHistoryRunStatistics(),
      batchCount: Number(row.batchCount),
      completedBatchCount: Number(row.completedBatchCount),
      totalWeightLbs: Number(row.totalWeightLbs),
    });
  for (const row of orderRows) {
    const current =
      statistics.get(row.productionRunId) ?? emptyHistoryRunStatistics();
    statistics.set(row.productionRunId, {
      ...current,
      orderCount: Number(row.orderCount),
      priorityOrderCount: Number(row.priorityOrderCount),
    });
  }
  return statistics;
};

const readHistoryRuns = async (
  database: PostgresExecutor,
  input: ListHistoryRunsInput,
  asOf: Date,
  schema: ProductionSchema,
) => {
  const cursor =
    input.cursor === undefined
      ? undefined
      : historyRunsCursor.decode(input.cursor, input);
  if (cursor === null) return { kind: 'invalid_cursor' as const };
  const rows = await database
    .select(runSelect(schema))
    .from(schema.productionRuns)
    .innerJoin(
      schema.productionShifts,
      and(
        eq(schema.productionShifts.id, schema.productionRuns.productionShiftId),
        eq(
          schema.productionShifts.locationId,
          schema.productionRuns.locationId,
        ),
      ),
    )
    .where(
      and(
        eq(schema.productionRuns.locationId, input.locationId),
        input.status === undefined
          ? undefined
          : eq(schema.productionRuns.status, input.status),
        input.createdAfter === undefined
          ? undefined
          : gte(schema.productionRuns.createdAt, input.createdAfter),
        input.search === undefined
          ? undefined
          : sql<boolean>`(
              strpos(lower(${schema.productionRuns.id}::text), lower(${input.search})) > 0
              or strpos(lower(${schema.productionRuns.productionShiftId}::text), lower(${input.search})) > 0
              or strpos(lower(${schema.productionRuns.scheduleRunId}::text), lower(${input.search})) > 0
            )`,
        cursor === undefined
          ? undefined
          : sql<boolean>`(${schema.productionRuns.createdAt}, ${schema.productionRuns.id}) < (${cursor.createdAtKey}::timestamptz, ${cursor.id}::uuid)`,
      ),
    )
    .orderBy(
      desc(schema.productionRuns.createdAt),
      desc(schema.productionRuns.id),
    )
    .limit(input.limit + 1);

  const hasNextPage = rows.length > input.limit;
  const pageRows = rows.slice(0, input.limit);
  const statistics = await loadStatistics(
    database,
    pageRows.map((row) => row.id),
    schema,
  );
  const last = pageRows.at(-1);
  return {
    kind: 'found' as const,
    page: {
      items: pageRows.map((row) =>
        projectHistoryRun(
          row,
          statistics.get(row.id) ?? emptyHistoryRunStatistics(),
        ),
      ),
      nextCursor:
        hasNextPage && last !== undefined
          ? historyRunsCursor.encode(input, {
              createdAtKey: last.cursorCreatedAtKey,
              id: last.id,
            })
          : null,
      asOf,
    },
  };
};

export const makeListHistoryRunsPostgresRepository = (
  database: PostgresDatabase,
  schema: ProductionSchema,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): ListHistoryRunsRepository => ({
  list: async (input, asOf) => {
    const cursor =
      input.cursor === undefined
        ? undefined
        : historyRunsCursor.decode(input.cursor, input);
    if (cursor === null) return { kind: 'invalid_cursor' };
    if (
      !(await locationExists(input.locationId, productionScopeReconciliationV1))
    )
      return { kind: 'location_not_found' };

    return database.transaction(
      (transaction) => readHistoryRuns(transaction, input, asOf, schema),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  },
});
