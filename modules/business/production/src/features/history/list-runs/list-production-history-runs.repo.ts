import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import { and, desc, eq, gte, lt, or, sql } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { productionHistoryLocationExists } from '../../../foundations/adapters/postgres/history/production-history-location.repo.ts';
import {
  emptyProductionHistoryRunStatistics,
  mapProductionHistoryRun,
} from '../../../foundations/adapters/postgres/history/production-history-run.persistence.mapper.ts';
import {
  loadProductionHistoryRunStatistics,
  productionHistoryRunSelect,
} from '../../../foundations/adapters/postgres/history/production-history-run.repo.ts';
import type { ProductionHistoryCursorPoint } from '../../../foundations/language/history/production-history.model.ts';
import { defineProductionHistoryCursor } from '../../../foundations/language/history/production-history-cursor.factory.ts';
import type { ListProductionHistoryRunsCommand } from './list-production-history-runs.model.ts';
import type { ListProductionHistoryRunsRepository } from './list-production-history-runs.port.ts';

const productionHistoryRunsCursor = defineProductionHistoryCursor<
  ListProductionHistoryRunsCommand,
  'runs'
>({
  kind: 'runs',
  projectFilter: (command) => ({
    search: command.search ?? null,
    status: command.status ?? null,
    createdAfter: command.createdAfter?.toISOString() ?? null,
  }),
});

const loadRunPage = (
  db: DatabaseExecutor,
  command: ListProductionHistoryRunsCommand,
  cursor: ProductionHistoryCursorPoint | undefined,
) =>
  db
    .select(productionHistoryRunSelect)
    .from(laundryProduction.productionRuns)
    .innerJoin(
      laundryProduction.productionShifts,
      and(
        eq(
          laundryProduction.productionShifts.id,
          laundryProduction.productionRuns.productionShiftId,
        ),
        eq(
          laundryProduction.productionShifts.locationId,
          laundryProduction.productionRuns.locationId,
        ),
      ),
    )
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, command.locationId),
        command.status === undefined
          ? undefined
          : eq(laundryProduction.productionRuns.status, command.status),
        command.createdAfter === undefined
          ? undefined
          : gte(
              laundryProduction.productionRuns.createdAt,
              command.createdAfter,
            ),
        command.search === undefined
          ? undefined
          : sql<boolean>`(
              strpos(lower(${laundryProduction.productionRuns.id}::text), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.productionRuns.productionShiftId}::text), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.productionRuns.scheduleRunId}::text), lower(${command.search})) > 0
            )`,
        cursor === undefined
          ? undefined
          : or(
              lt(laundryProduction.productionRuns.createdAt, cursor.createdAt),
              and(
                eq(
                  laundryProduction.productionRuns.createdAt,
                  cursor.createdAt,
                ),
                lt(laundryProduction.productionRuns.id, cursor.id),
              ),
            ),
      ),
    )
    .orderBy(
      desc(laundryProduction.productionRuns.createdAt),
      desc(laundryProduction.productionRuns.id),
    )
    .limit(command.limit + 1);

const listRuns = async (
  db: DatabaseExecutor,
  command: ListProductionHistoryRunsCommand,
  now: Date,
) => {
  const cursor =
    command.cursor === undefined
      ? undefined
      : productionHistoryRunsCursor.decode(command.cursor, command);
  if (cursor === null) return { tag: 'invalid_cursor' as const };
  if (!(await productionHistoryLocationExists(db, command.locationId)))
    return { tag: 'location_not_found' as const };

  const rows = await loadRunPage(db, command, cursor);
  const hasNextPage = rows.length > command.limit;
  const pageRows = rows.slice(0, command.limit);
  const statistics = await loadProductionHistoryRunStatistics(
    db,
    pageRows.map((row) => row.id),
  );
  const last = pageRows.at(-1);

  return {
    tag: 'found' as const,
    value: {
      items: pageRows.map((row) =>
        mapProductionHistoryRun(
          row,
          statistics.get(row.id) ?? emptyProductionHistoryRunStatistics(),
        ),
      ),
      nextCursor:
        hasNextPage && last !== undefined
          ? productionHistoryRunsCursor.encode(command, {
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
      asOf: now,
    },
  };
};

export const makeListProductionHistoryRunsRepository = (
  database: Database,
): ListProductionHistoryRunsRepository => ({
  list: (command, now) =>
    database.transaction((db) => listRuns(db, command, now), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    }),
});
