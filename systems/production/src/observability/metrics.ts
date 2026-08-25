export const productionMetricTransactionOperations = Object.freeze([
  'production.accept_schedule',
  'production.advance_stage',
  'production.apply_fulfillment_demand',
  'production.assign_stage_machines',
  'production.attempt_automatic_placement',
  'production.change_admission',
  'production.change_order_resolution',
  'production.commit_order_backlog',
  'production.confirm_order_overtime',
  'production.create_schedule',
  'production.create_shift',
  'production.manage_batch_membership',
  'production.manage_resources',
  'production.place_order_automatically',
  'production.place_order_exactly',
  'production.publish_scheduler_config',
  'production.record_order_intake',
  'production.reconcile_batch_progress',
  'production.replace_shift_selection',
  'production.route_order',
  'production.set_order_priority',
  'production.start_schedule',
  'production.update_shift',
] as const);

export const productionPlacementStatuses = Object.freeze([
  'placed',
  'confirmation_required',
  'not_placed',
] as const);
export const productionPlacementModes = Object.freeze([
  'automatic',
  'manager_exact',
] as const);
export const productionPlacementReasons = Object.freeze([
  'none',
  'hard_capacity_exceeded',
  'run_not_started',
  'run_completed',
  'order_not_eligible',
  'order_already_scheduled',
  'no_mutable_position',
  'queue_conflict',
  'proposal_stale',
] as const);
export const productionQueueConflictOperations = Object.freeze([
  'automatic_placement',
  'freeze_membership',
  'manager_exact_placement',
  'overtime_confirmation',
  'unfreeze_membership',
  'order_route_commit',
  'order_route_preview',
] as const);
export const productionBatchFreezeSources = Object.freeze([
  'explicit',
  'stage_start',
] as const);
export const productionOrderRouteOperations = Object.freeze([
  'preview',
  'commit',
] as const);
export const productionOrderRouteStatuses = Object.freeze([
  'proposed',
  'committed',
  'replayed',
  'rejected',
  'conflict',
  'failed',
] as const);
export const productionOrderRouteKinds = Object.freeze([
  'queued_move',
  'exception',
] as const);
export const productionOrderRouteReasons = Object.freeze([
  'manual_rebatch',
  'needs_more_drying',
  'rewash_required',
  'sorting_incomplete',
  'stage_incomplete',
  'other',
] as const);
export const productionProgressTargets = Object.freeze([
  'sorting_started',
  'sorting_completed',
  'washing_started',
  'washing_completed',
  'drying_started',
  'drying_completed',
  'folding_packaging_started',
  'finished',
] as const);

export type ProductionMetricName =
  | 'production.plan_supersessions'
  | 'production.runs_started'
  | 'production.placement_outcomes'
  | 'production.queue_conflicts'
  | 'production.batch_freezes'
  | 'production.overtime_confirmations'
  | 'production.order_route_outcomes'
  | 'production.progress_reconciliations';

type ProductionMetricAttribute =
  | 'runtime'
  | 'operation'
  | 'status'
  | 'mode'
  | 'reason'
  | 'source'
  | 'kind'
  | 'target'
  | 'runCompleted';

export type ProductionMetricDescriptor = Readonly<{
  name: ProductionMetricName;
  instrument: 'counter';
  unit: 'count';
  allowedAttributes: readonly ProductionMetricAttribute[];
  attributeValues?: Readonly<
    Partial<Record<ProductionMetricAttribute, readonly string[]>>
  >;
}>;

export const productionMetricDescriptors = Object.freeze([
  {
    name: 'production.plan_supersessions',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'operation'],
    attributeValues: { operation: ['compute_replace_current'] },
  },
  {
    name: 'production.runs_started',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime'],
  },
  {
    name: 'production.placement_outcomes',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'status', 'mode', 'reason'],
    attributeValues: {
      status: productionPlacementStatuses,
      mode: productionPlacementModes,
      reason: productionPlacementReasons,
    },
  },
  {
    name: 'production.queue_conflicts',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'operation'],
    attributeValues: { operation: productionQueueConflictOperations },
  },
  {
    name: 'production.batch_freezes',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'source'],
    attributeValues: { source: productionBatchFreezeSources },
  },
  {
    name: 'production.overtime_confirmations',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'status'],
    attributeValues: { status: ['placed'] },
  },
  {
    name: 'production.order_route_outcomes',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'operation', 'status', 'kind', 'reason'],
    attributeValues: {
      operation: productionOrderRouteOperations,
      status: productionOrderRouteStatuses,
      kind: productionOrderRouteKinds,
      reason: productionOrderRouteReasons,
    },
  },
  {
    name: 'production.progress_reconciliations',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'target', 'runCompleted'],
    attributeValues: {
      target: productionProgressTargets,
      runCompleted: ['true', 'false'],
    },
  },
] as const satisfies readonly ProductionMetricDescriptor[]);
