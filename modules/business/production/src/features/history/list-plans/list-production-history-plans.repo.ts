import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import { and, desc, eq, gte, lt, or, sql } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { productionHistoryLocationExists } from '../../../foundations/adapters/postgres/history/production-history-location.repo.ts';
import { defineProductionHistoryCursor } from '../../../foundations/language/history/production-history-cursor.factory.ts';
import { mapProductionHistoryPlan } from '../../../foundations/adapters/postgres/history/production-history-plan.persistence.mapper.ts';
import { productionHistoryPlanSelect } from '../../../foundations/adapters/postgres/history/production-history-plan.repo.ts';
import type { ProductionHistoryCursorPoint } from '../../../foundations/language/history/production-history.model.ts';
import type { ListProductionHistoryPlansCommand } from './list-production-history-plans.model.ts';
import type { ListProductionHistoryPlansRepository } from './list-production-history-plans.port.ts';

const productionHistoryPlansCursor = defineProductionHistoryCursor<
  ListProductionHistoryPlansCommand,
  'plans'
>({
  kind: 'plans',
  projectFilter: (command) => ({
    runId: command.runId ?? null,
    search: command.search ?? null,
    status: command.status ?? null,
    createdAfter: command.createdAfter?.toISOString() ?? null,
  }),
});

const loadPlanPage = (
  db: DatabaseExecutor,
  command: ListProductionHistoryPlansCommand,
  cursor: ProductionHistoryCursorPoint | undefined,
) =>
  db
    .select(productionHistoryPlanSelect)
    .from(laundryProduction.scheduleRuns)
    .innerJoin(
      laundryProduction.productionShifts,
      and(
        eq(
          laundryProduction.productionShifts.id,
          laundryProduction.scheduleRuns.productionShiftId,
        ),
        eq(
          laundryProduction.productionShifts.locationId,
          laundryProduction.scheduleRuns.locationId,
        ),
      ),
    )
    .leftJoin(
      laundryProduction.productionRuns,
      and(
        eq(
          laundryProduction.productionRuns.scheduleRunId,
          laundryProduction.scheduleRuns.id,
        ),
        eq(
          laundryProduction.productionRuns.locationId,
          laundryProduction.scheduleRuns.locationId,
        ),
      ),
    )
    .where(
      and(
        eq(laundryProduction.scheduleRuns.locationId, command.locationId),
        command.runId === undefined
          ? undefined
          : eq(laundryProduction.productionRuns.id, command.runId),
        command.status === undefined
          ? undefined
          : eq(laundryProduction.scheduleRuns.status, command.status),
        command.createdAfter === undefined
          ? undefined
          : gte(laundryProduction.scheduleRuns.createdAt, command.createdAfter),
        command.search === undefined
          ? undefined
          : sql<boolean>`(
              strpos(lower(${laundryProduction.scheduleRuns.id}::text), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.scheduleRuns.productionShiftId}::text), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.scheduleRuns.schedulerConfigId}::text), lower(${command.search})) > 0
              or strpos(lower(coalesce(${laundryProduction.productionRuns.id}::text, '')), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.scheduleRuns.algorithmVersion}), lower(${command.search})) > 0
            )`,
        cursor === undefined
          ? undefined
          : or(
              lt(laundryProduction.scheduleRuns.createdAt, cursor.createdAt),
              and(
                eq(laundryProduction.scheduleRuns.createdAt, cursor.createdAt),
                lt(laundryProduction.scheduleRuns.id, cursor.id),
              ),
            ),
      ),
    )
    .orderBy(
      desc(laundryProduction.scheduleRuns.createdAt),
      desc(laundryProduction.scheduleRuns.id),
    )
    .limit(command.limit + 1);

const listPlans = async (
  db: DatabaseExecutor,
  command: ListProductionHistoryPlansCommand,
  now: Date,
) => {
  const cursor =
    command.cursor === undefined
      ? undefined
      : productionHistoryPlansCursor.decode(command.cursor, command);
  if (cursor === null) return { tag: 'invalid_cursor' as const };
  if (!(await productionHistoryLocationExists(db, command.locationId)))
    return { tag: 'location_not_found' as const };

  const rows = await loadPlanPage(db, command, cursor);
  const hasNextPage = rows.length > command.limit;
  const pageRows = rows.slice(0, command.limit);
  const last = pageRows.at(-1);

  return {
    tag: 'found' as const,
    value: {
      items: pageRows.map(mapProductionHistoryPlan),
      nextCursor:
        hasNextPage && last !== undefined
          ? productionHistoryPlansCursor.encode(command, {
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
      asOf: now,
    },
  };
};

export const makeListProductionHistoryPlansRepository = (
  database: Database,
): ListProductionHistoryPlansRepository => ({
  list: (command, now) =>
    database.transaction((db) => listPlans(db, command, now), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    }),
});
