import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import { and, desc, eq, gte, inArray, lt, or, sql } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import {
  productionHistoryActivitySelect,
  productionHistoryRunScope,
  resolvedProductionHistoryRunId,
} from '../../../foundations/adapters/postgres/history/production-history-activity.repo.ts';
import { mapProductionHistoryActivity } from '../../../foundations/adapters/postgres/history/production-history-activity.persistence.mapper.ts';
import { defineProductionHistoryCursor } from '../../../foundations/language/history/production-history-cursor.factory.ts';
import { productionHistoryLocationExists } from '../../../foundations/adapters/postgres/history/production-history-location.repo.ts';
import { productionHistoryEventTypes } from '../../../foundations/language/history/production-history.model.ts';
import type { ProductionHistoryCursorPoint } from '../../../foundations/language/history/production-history.model.ts';
import type { ListProductionHistoryActivityCommand } from './list-production-history-activity.model.ts';
import type { ListProductionHistoryActivityRepository } from './list-production-history-activity.port.ts';

const productionHistoryActivityCursor = defineProductionHistoryCursor<
  ListProductionHistoryActivityCommand,
  'activity'
>({
  kind: 'activity',
  projectFilter: (command) => ({
    runId: command.runId ?? null,
    entityType: command.entityType ?? null,
    eventType: command.eventType ?? null,
    orderResolution: command.orderResolution ?? null,
    search: command.search ?? null,
    occurredAfter: command.occurredAfter?.toISOString() ?? null,
  }),
});

const loadActivityPage = (
  db: DatabaseExecutor,
  command: ListProductionHistoryActivityCommand,
  cursor: ProductionHistoryCursorPoint | undefined,
) =>
  db
    .select({
      ...productionHistoryActivitySelect,
      resolvedProductionRunId: resolvedProductionHistoryRunId,
    })
    .from(laundryProduction.workEvents)
    .leftJoin(
      auth.authIdentities,
      eq(auth.authIdentities.id, laundryProduction.workEvents.actorId),
    )
    .leftJoin(
      laundryProduction.productionOrders,
      and(
        eq(
          laundryProduction.productionOrders.id,
          laundryProduction.workEvents.entityId,
        ),
        eq(
          laundryProduction.productionOrders.locationId,
          laundryProduction.workEvents.locationId,
        ),
        eq(laundryProduction.workEvents.entityType, 'production_order'),
      ),
    )
    .where(
      and(
        eq(laundryProduction.workEvents.locationId, command.locationId),
        inArray(laundryProduction.workEvents.eventType, [
          ...productionHistoryEventTypes,
        ]),
        command.entityType === undefined
          ? undefined
          : eq(laundryProduction.workEvents.entityType, command.entityType),
        command.eventType === undefined
          ? undefined
          : eq(laundryProduction.workEvents.eventType, command.eventType),
        command.orderResolution === undefined
          ? undefined
          : command.orderResolution === 'archived'
            ? inArray(laundryProduction.workEvents.eventType, [
                'production_order_resolved_without_production',
                'production_order_bulk_resolved_without_production',
              ])
            : eq(
                laundryProduction.workEvents.eventType,
                'production_order_restored',
              ),
        command.runId === undefined
          ? undefined
          : productionHistoryRunScope(command.runId),
        command.occurredAfter === undefined
          ? undefined
          : gte(laundryProduction.workEvents.createdAt, command.occurredAfter),
        command.search === undefined
          ? undefined
          : sql<boolean>`(
              strpos(lower(${laundryProduction.workEvents.eventType}), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.workEvents.entityType}), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.workEvents.entityId}::text), lower(${command.search})) > 0
              or strpos(lower(coalesce(${auth.authIdentities.displayName}, '')), lower(${command.search})) > 0
            )`,
        cursor === undefined
          ? undefined
          : or(
              lt(laundryProduction.workEvents.createdAt, cursor.createdAt),
              and(
                eq(laundryProduction.workEvents.createdAt, cursor.createdAt),
                lt(laundryProduction.workEvents.id, cursor.id),
              ),
            ),
      ),
    )
    .orderBy(
      desc(laundryProduction.workEvents.createdAt),
      desc(laundryProduction.workEvents.id),
    )
    .limit(command.limit + 1);

const listActivity = async (
  db: DatabaseExecutor,
  command: ListProductionHistoryActivityCommand,
  now: Date,
) => {
  const cursor =
    command.cursor === undefined
      ? undefined
      : productionHistoryActivityCursor.decode(command.cursor, command);
  if (cursor === null) return { tag: 'invalid_cursor' as const };
  if (!(await productionHistoryLocationExists(db, command.locationId)))
    return { tag: 'location_not_found' as const };

  const rows = await loadActivityPage(db, command, cursor);
  const hasNextPage = rows.length > command.limit;
  const pageRows = rows.slice(0, command.limit);
  const last = pageRows.at(-1);

  return {
    tag: 'found' as const,
    value: {
      items: pageRows.flatMap((row) => {
        const mapped = mapProductionHistoryActivity(
          row,
          command.runId ?? row.resolvedProductionRunId,
        );
        return mapped === null ? [] : [mapped];
      }),
      nextCursor:
        hasNextPage && last !== undefined
          ? productionHistoryActivityCursor.encode(command, {
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
      asOf: now,
    },
  };
};

export const makeListProductionHistoryActivityRepository = (
  database: Database,
): ListProductionHistoryActivityRepository => ({
  list: (command, now) =>
    database.transaction((db) => listActivity(db, command, now), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    }),
});
