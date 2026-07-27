import { laundryProduction, sql } from '@pressly/db';

type ProductionOrderEvidenceInput = Readonly<{
  locationId: string;
  productionOrderId: typeof laundryProduction.productionOrders.id;
}>;

/**
 * Current selection is mutable planning state, but it is still sufficient to
 * prevent an order from being resolved out of active operations.
 */
export const hasCurrentProductionOrderSelection = (
  input: ProductionOrderEvidenceInput,
) => sql<boolean>`exists (
  select 1
  from ${laundryProduction.productionShiftSelectedOrders} selected_order
  where selected_order.production_order_id = ${input.productionOrderId}
    and selected_order.location_id = ${input.locationId}
)`;

/**
 * Scheduling snapshots and successful selection commands are immutable
 * evidence that an operator committed this order to planning at least once.
 * A later deselection must not erase that fact.
 */
export const hasHistoricalProductionOrderSelectionEvidence = (
  input: ProductionOrderEvidenceInput,
) => sql<boolean>`(
  exists (
    select 1
    from ${laundryProduction.scheduleRuns} schedule_history
    where schedule_history.location_id = ${input.locationId}
      and schedule_history.input_snapshot @> jsonb_build_object(
        'orders',
        jsonb_build_array(
          jsonb_build_object('id', ${input.productionOrderId})
        )
      )
  )
  or exists (
    select 1
    from ${laundryProduction.workEvents} selection_event
    where selection_event.location_id = ${input.locationId}
      and selection_event.entity_type = 'production_shift'
      and selection_event.event_type = 'production_shift_selection_replaced'
      and selection_event.payload_json @> jsonb_build_object(
        'selectedOrderIds',
        jsonb_build_array(${input.productionOrderId})
      )
  )
)`;

export const hasAnyProductionOrderSelectionEvidence = (
  input: ProductionOrderEvidenceInput,
) =>
  sql<boolean>`(
    ${hasCurrentProductionOrderSelection(input)}
    or ${hasHistoricalProductionOrderSelectionEvidence(input)}
  )`;
