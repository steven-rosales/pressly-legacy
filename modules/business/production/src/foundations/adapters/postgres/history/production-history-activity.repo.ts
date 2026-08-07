import { sql } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import * as laundryProduction from '@pressly/db/schema/laundry-production';

export const productionHistoryActivitySelect = {
  id: laundryProduction.workEvents.id,
  eventType: laundryProduction.workEvents.eventType,
  entityType: laundryProduction.workEvents.entityType,
  entityId: laundryProduction.workEvents.entityId,
  actorId: laundryProduction.workEvents.actorId,
  actorDisplayName: auth.authIdentities.displayName,
  expectedVersion: laundryProduction.workEvents.expectedVersion,
  payload: laundryProduction.workEvents.payload,
  currentResolutionState: laundryProduction.productionOrders.resolutionState,
  currentProductionVersion: laundryProduction.productionOrders.version,
  createdAt: laundryProduction.workEvents.createdAt,
  cursorCreatedAtKey:
    sql<string>`to_char(${laundryProduction.workEvents.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
      'cursor_created_at_key',
    ),
} as const;

export const productionHistoryRunScope = (productionRunId: string) =>
  sql<boolean>`(
    (${laundryProduction.workEvents.entityType} = 'production_run'
      and ${laundryProduction.workEvents.entityId} = ${productionRunId})
    or (${laundryProduction.workEvents.entityType} = 'production_batch'
      and exists (
        select 1 from production_batches as scoped_batch
        where scoped_batch.id = ${laundryProduction.workEvents.entityId}
          and scoped_batch.production_run_id = ${productionRunId}
      ))
    or (${laundryProduction.workEvents.entityType} = 'stage_run'
      and exists (
        select 1 from stage_runs as scoped_stage
        join production_batches as scoped_stage_batch
          on scoped_stage_batch.id = scoped_stage.production_batch_id
        where scoped_stage.id = ${laundryProduction.workEvents.entityId}
          and scoped_stage_batch.production_run_id = ${productionRunId}
      ))
    or (${laundryProduction.workEvents.entityType} = 'schedule_run'
      and exists (
        select 1 from production_runs as scoped_schedule_run
        where scoped_schedule_run.schedule_run_id = ${laundryProduction.workEvents.entityId}
          and scoped_schedule_run.id = ${productionRunId}
      ))
    or (${laundryProduction.workEvents.entityType} = 'production_shift'
      and exists (
        select 1 from production_runs as scoped_shift_run
        where scoped_shift_run.production_shift_id = ${laundryProduction.workEvents.entityId}
          and scoped_shift_run.id = ${productionRunId}
      ))
    or (${laundryProduction.workEvents.entityType} = 'production_order'
      and exists (
        select 1 from production_batch_orders as scoped_membership
        join production_batches as scoped_order_batch
          on scoped_order_batch.id = scoped_membership.production_batch_id
        where scoped_membership.production_order_id = ${laundryProduction.workEvents.entityId}
          and scoped_order_batch.production_run_id = ${productionRunId}
      ))
    or (${laundryProduction.workEvents.entityType} = 'order_demand'
      and exists (
        select 1 from production_orders as scoped_order
        join production_batch_orders as scoped_demand_membership
          on scoped_demand_membership.production_order_id = scoped_order.id
        join production_batches as scoped_demand_batch
          on scoped_demand_batch.id = scoped_demand_membership.production_batch_id
        where scoped_order.order_demand_id = ${laundryProduction.workEvents.entityId}
          and scoped_demand_batch.production_run_id = ${productionRunId}
      ))
  )`;

export const resolvedProductionHistoryRunId = sql<string | null>`case
  when ${laundryProduction.workEvents.entityType} = 'production_run'
    then ${laundryProduction.workEvents.entityId}
  when ${laundryProduction.workEvents.entityType} = 'production_batch'
    then (
      select resolved_batch.production_run_id
      from production_batches as resolved_batch
      where resolved_batch.id = ${laundryProduction.workEvents.entityId}
      limit 1
    )
  when ${laundryProduction.workEvents.entityType} = 'stage_run'
    then (
      select resolved_stage_batch.production_run_id
      from stage_runs as resolved_stage
      join production_batches as resolved_stage_batch
        on resolved_stage_batch.id = resolved_stage.production_batch_id
      where resolved_stage.id = ${laundryProduction.workEvents.entityId}
      limit 1
    )
  when ${laundryProduction.workEvents.entityType} = 'schedule_run'
    then (
      select resolved_schedule_run.id
      from production_runs as resolved_schedule_run
      where resolved_schedule_run.schedule_run_id = ${laundryProduction.workEvents.entityId}
      limit 1
    )
  when ${laundryProduction.workEvents.entityType} = 'production_shift'
    then (
      select resolved_shift_run.id
      from production_runs as resolved_shift_run
      where resolved_shift_run.production_shift_id = ${laundryProduction.workEvents.entityId}
      limit 1
    )
  when ${laundryProduction.workEvents.entityType} = 'production_order'
    then (
      select resolved_order_batch.production_run_id
      from production_batch_orders as resolved_membership
      join production_batches as resolved_order_batch
        on resolved_order_batch.id = resolved_membership.production_batch_id
      where resolved_membership.production_order_id = ${laundryProduction.workEvents.entityId}
      order by resolved_order_batch.created_at desc, resolved_order_batch.id desc
      limit 1
    )
  when ${laundryProduction.workEvents.entityType} = 'order_demand'
    then (
      select resolved_demand_batch.production_run_id
      from production_orders as resolved_order
      join production_batch_orders as resolved_demand_membership
        on resolved_demand_membership.production_order_id = resolved_order.id
      join production_batches as resolved_demand_batch
        on resolved_demand_batch.id = resolved_demand_membership.production_batch_id
      where resolved_order.order_demand_id = ${laundryProduction.workEvents.entityId}
      order by resolved_demand_batch.created_at desc, resolved_demand_batch.id desc
      limit 1
    )
  else null
end`.as('resolved_production_run_id');
