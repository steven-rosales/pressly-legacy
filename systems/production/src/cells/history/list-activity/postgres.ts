import type { ProductionActorReadV1Capability } from '@pressly/access-system/capabilities/production-actor-read-v1';
import type { ProductionScopeReconciliationV1Capability } from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, desc, eq, gte, inArray, or, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { historyActivityCursor } from './cursor.ts';
import { projectHistoryActivity } from './project.ts';
import {
  historyActivityEventTypes,
  type ListHistoryActivityInput,
  type ListHistoryActivityRepository,
} from './types.ts';

const activitySelect = (schema: ProductionSchema) =>
  ({
    id: schema.workEvents.id,
    eventType: schema.workEvents.eventType,
    entityType: schema.workEvents.entityType,
    entityId: schema.workEvents.entityId,
    actorId: schema.workEvents.actorId,
    expectedVersion: schema.workEvents.expectedVersion,
    payload: schema.workEvents.payload,
    currentResolutionState: schema.productionOrders.resolutionState,
    currentProductionVersion: schema.productionOrders.version,
    createdAt: schema.workEvents.createdAt,
    cursorCreatedAtKey:
      sql<string>`to_char(${schema.workEvents.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        'cursor_created_at_key',
      ),
  }) as const;

const runScope = (productionRunId: string, schema: ProductionSchema) =>
  sql<boolean>`(
    (${schema.workEvents.entityType} = 'production_run'
      and ${schema.workEvents.entityId} = ${productionRunId})
    or (${schema.workEvents.entityType} = 'production_batch'
      and exists (
        select 1 from production_batches as scoped_batch
        where scoped_batch.id = ${schema.workEvents.entityId}
          and scoped_batch.production_run_id = ${productionRunId}
      ))
    or (${schema.workEvents.entityType} = 'stage_run'
      and exists (
        select 1 from stage_runs as scoped_stage
        join production_batches as scoped_stage_batch
          on scoped_stage_batch.id = scoped_stage.production_batch_id
        where scoped_stage.id = ${schema.workEvents.entityId}
          and scoped_stage_batch.production_run_id = ${productionRunId}
      ))
    or (${schema.workEvents.entityType} = 'schedule_run'
      and exists (
        select 1 from production_runs as scoped_schedule_run
        where scoped_schedule_run.schedule_run_id = ${schema.workEvents.entityId}
          and scoped_schedule_run.id = ${productionRunId}
      ))
    or (${schema.workEvents.entityType} = 'production_shift'
      and exists (
        select 1 from production_runs as scoped_shift_run
        where scoped_shift_run.production_shift_id = ${schema.workEvents.entityId}
          and scoped_shift_run.id = ${productionRunId}
      ))
    or (${schema.workEvents.entityType} = 'production_order'
      and exists (
        select 1 from production_batch_orders as scoped_membership
        join production_batches as scoped_order_batch
          on scoped_order_batch.id = scoped_membership.production_batch_id
        where scoped_membership.production_order_id = ${schema.workEvents.entityId}
          and scoped_order_batch.production_run_id = ${productionRunId}
      ))
    or (${schema.workEvents.entityType} = 'order_demand'
      and exists (
        select 1 from production_orders as scoped_order
        join production_batch_orders as scoped_demand_membership
          on scoped_demand_membership.production_order_id = scoped_order.id
        join production_batches as scoped_demand_batch
          on scoped_demand_batch.id = scoped_demand_membership.production_batch_id
        where scoped_order.order_demand_id = ${schema.workEvents.entityId}
          and scoped_demand_batch.production_run_id = ${productionRunId}
      ))
  )`;

const resolvedRunId = (schema: ProductionSchema) =>
  sql<string | null>`case
  when ${schema.workEvents.entityType} = 'production_run'
    then ${schema.workEvents.entityId}
  when ${schema.workEvents.entityType} = 'production_batch'
    then (
      select resolved_batch.production_run_id
      from production_batches as resolved_batch
      where resolved_batch.id = ${schema.workEvents.entityId}
      limit 1
    )
  when ${schema.workEvents.entityType} = 'stage_run'
    then (
      select resolved_stage_batch.production_run_id
      from stage_runs as resolved_stage
      join production_batches as resolved_stage_batch
        on resolved_stage_batch.id = resolved_stage.production_batch_id
      where resolved_stage.id = ${schema.workEvents.entityId}
      limit 1
    )
  when ${schema.workEvents.entityType} = 'schedule_run'
    then (
      select resolved_schedule_run.id
      from production_runs as resolved_schedule_run
      where resolved_schedule_run.schedule_run_id = ${schema.workEvents.entityId}
      limit 1
    )
  when ${schema.workEvents.entityType} = 'production_shift'
    then (
      select resolved_shift_run.id
      from production_runs as resolved_shift_run
      where resolved_shift_run.production_shift_id = ${schema.workEvents.entityId}
      limit 1
    )
  when ${schema.workEvents.entityType} = 'production_order'
    then (
      select resolved_order_batch.production_run_id
      from production_batch_orders as resolved_membership
      join production_batches as resolved_order_batch
        on resolved_order_batch.id = resolved_membership.production_batch_id
      where resolved_membership.production_order_id = ${schema.workEvents.entityId}
      order by resolved_order_batch.created_at desc, resolved_order_batch.id desc
      limit 1
    )
  when ${schema.workEvents.entityType} = 'order_demand'
    then (
      select resolved_demand_batch.production_run_id
      from production_orders as resolved_order
      join production_batch_orders as resolved_demand_membership
        on resolved_demand_membership.production_order_id = resolved_order.id
      join production_batches as resolved_demand_batch
        on resolved_demand_batch.id = resolved_demand_membership.production_batch_id
      where resolved_order.order_demand_id = ${schema.workEvents.entityId}
      order by resolved_demand_batch.created_at desc, resolved_demand_batch.id desc
      limit 1
    )
  else null
end`.as('resolved_production_run_id');

const locationExists = async (
  locationId: string,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): Promise<boolean> =>
  (await productionScopeReconciliationV1.load({
    locationId,
  })) !== null;

const loadPage = (
  database: PostgresExecutor,
  input: ListHistoryActivityInput,
  cursor:
    | Readonly<{
        createdAtKey: string;
        id: string;
      }>
    | undefined,
  schema: ProductionSchema,
  matchingActorIds: readonly string[],
) => {
  return database
    .select({
      ...activitySelect(schema),
      resolvedProductionRunId: resolvedRunId(schema),
    })
    .from(schema.workEvents)
    .leftJoin(
      schema.productionOrders,
      and(
        eq(schema.productionOrders.id, schema.workEvents.entityId),
        eq(schema.productionOrders.locationId, schema.workEvents.locationId),
        eq(schema.workEvents.entityType, 'production_order'),
      ),
    )
    .where(
      and(
        eq(schema.workEvents.locationId, input.locationId),
        inArray(schema.workEvents.eventType, [...historyActivityEventTypes]),
        input.entityType === undefined
          ? undefined
          : eq(schema.workEvents.entityType, input.entityType),
        input.eventType === undefined
          ? undefined
          : eq(schema.workEvents.eventType, input.eventType),
        input.orderResolution === undefined
          ? undefined
          : input.orderResolution === 'archived'
            ? inArray(schema.workEvents.eventType, [
                'production_order_resolved_without_production',
                'production_order_bulk_resolved_without_production',
              ])
            : eq(schema.workEvents.eventType, 'production_order_restored'),
        input.runId === undefined ? undefined : runScope(input.runId, schema),
        input.occurredAfter === undefined
          ? undefined
          : gte(schema.workEvents.createdAt, input.occurredAfter),
        input.search === undefined
          ? undefined
          : or(
              sql<boolean>`strpos(lower(${schema.workEvents.eventType}), lower(${input.search})) > 0`,
              sql<boolean>`strpos(lower(${schema.workEvents.entityType}), lower(${input.search})) > 0`,
              sql<boolean>`strpos(lower(${schema.workEvents.entityId}::text), lower(${input.search})) > 0`,
              matchingActorIds.length === 0
                ? undefined
                : inArray(schema.workEvents.actorId, [...matchingActorIds]),
            ),
        cursor === undefined
          ? undefined
          : sql<boolean>`(${schema.workEvents.createdAt}, ${schema.workEvents.id}) < (${cursor.createdAtKey}::timestamptz, ${cursor.id}::uuid)`,
      ),
    )
    .orderBy(desc(schema.workEvents.createdAt), desc(schema.workEvents.id))
    .limit(input.limit + 1);
};

const readHistoryActivity = async (
  database: PostgresDatabase,
  input: ListHistoryActivityInput,
  asOf: Date,
  schema: ProductionSchema,
  productionActorReadV1: ProductionActorReadV1Capability,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
) => {
  const readOnlyResult = <Value>(value: Value): Promise<Value> =>
    database.transaction(async () => value, {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
  const cursor =
    input.cursor === undefined
      ? undefined
      : historyActivityCursor.decode(input.cursor, input);
  if (cursor === null)
    return readOnlyResult({ kind: 'invalid_cursor' as const });
  if (
    !(await locationExists(input.locationId, productionScopeReconciliationV1))
  )
    return readOnlyResult({ kind: 'location_not_found' as const });

  const matchingActorIds =
    input.search === undefined
      ? []
      : await productionActorReadV1.findActorIdsByDisplayName({
          query: input.search,
        });
  const rows = await database.transaction(
    (transaction) =>
      loadPage(transaction, input, cursor, schema, matchingActorIds),
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
  const hasNextPage = rows.length > input.limit;
  const pageRows = rows.slice(0, input.limit);
  const actors = await productionActorReadV1.loadActors({
    actorIds: pageRows.map((row) => row.actorId),
  });
  const actorDisplayNameById = new Map(
    actors.map((actor) => [actor.id, actor.displayName]),
  );
  const last = pageRows.at(-1);

  return {
    kind: 'found' as const,
    page: {
      items: pageRows.flatMap((row) => {
        const projected = projectHistoryActivity(
          {
            ...row,
            actorDisplayName: actorDisplayNameById.get(row.actorId) ?? null,
          },
          input.runId ?? row.resolvedProductionRunId,
        );
        return projected === null ? [] : [projected];
      }),
      nextCursor:
        hasNextPage && last !== undefined
          ? historyActivityCursor.encode(input, {
              createdAtKey: last.cursorCreatedAtKey,
              id: last.id,
            })
          : null,
      asOf,
    },
  };
};

export const makeListHistoryActivityPostgresRepository = (
  database: PostgresDatabase,
  schema: ProductionSchema,
  productionActorReadV1: ProductionActorReadV1Capability,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): ListHistoryActivityRepository => ({
  list: (input, asOf) =>
    readHistoryActivity(
      database,
      input,
      asOf,
      schema,
      productionActorReadV1,
      productionScopeReconciliationV1,
    ),
});
