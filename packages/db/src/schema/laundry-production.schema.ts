import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

const weight = (name: string) =>
  numeric(name, { precision: 12, scale: 3, mode: 'number' });

export const stageBoundaryProvenanceEnum = pgEnum('stage_boundary_provenance', [
  'live_observed',
  'operator_reported',
  'not_recorded',
]);

export const productionLocations = pgTable('production_locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  liveRevision: bigint('live_revision', { mode: 'number' })
    .notNull()
    .default(0),
  ...timestamps,
});

export const orderDemands = pgTable(
  'order_demands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    demandKey: text('demand_key').notNull(),
    displayReference: text('display_reference').notNull(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    revisionHash: text('revision_hash').notNull(),
    revisionAt: timestamp('revision_at', {
      withTimezone: true,
    }).notNull(),
    phase: text('phase').notNull(),
    sourceStatusCode: text('source_status_code').notNull(),
    estimatedWeightLbs: weight('estimated_weight_lbs'),
    estimatedWeightSource: text('estimated_weight_source'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('order_demands_demand_key_unique').on(table.demandKey),
    uniqueIndex('order_demands_id_location_unique').on(
      table.id,
      table.locationId,
    ),
    index('order_demands_location_phase_idx').on(table.locationId, table.phase),
    check(
      'order_demands_phase_valid',
      sql`${table.phase} in ('expected', 'inbound', 'production_released', 'post_production', 'withdrawn')`,
    ),
    check(
      'order_demands_estimated_weight_positive',
      sql`${table.estimatedWeightLbs} is null or ${table.estimatedWeightLbs} > 0`,
    ),
    check(
      'order_demands_estimated_weight_provenance_consistent',
      sql`(${table.estimatedWeightLbs} is null) = (${table.estimatedWeightSource} is null)`,
    ),
  ],
);

export const productionShifts = pgTable(
  'production_shifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    timezone: text('timezone').notNull(),
    status: text('status').notNull().default('draft'),
    effectiveFolderCount: integer('effective_folder_count').notNull(),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('production_shifts_id_location_unique').on(
      table.id,
      table.locationId,
    ),
    check(
      'production_shifts_valid_window',
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      'production_shifts_positive_folders',
      sql`${table.effectiveFolderCount} > 0`,
    ),
    check('production_shifts_positive_version', sql`${table.version} > 0`),
  ],
);

export const productionOrders = pgTable(
  'production_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderDemandId: uuid('order_demand_id').notNull(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    priority: boolean('priority').notNull().default(false),
    status: text('status').notNull().default('eligible'),
    derivedWeightLbs: weight('derived_weight_lbs').notNull(),
    derivedWeightSource: text('derived_weight_source')
      .notNull()
      .default('external_estimate'),
    bagCount: integer('bag_count'),
    bagCountSource: text('bag_count_source'),
    intakeRecordedAt: timestamp('intake_recorded_at', { withTimezone: true }),
    intakeVersion: integer('intake_version').notNull().default(0),
    mustStayTogether: boolean('must_stay_together').notNull().default(true),
    version: integer('version').notNull().default(1),
    eligibleAt: timestamp('eligible_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    pendingPlacement: jsonb('pending_placement'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('production_orders_order_demand_unique').on(
      table.orderDemandId,
    ),
    check(
      'production_orders_positive_weight',
      sql`${table.derivedWeightLbs} > 0`,
    ),
    check(
      'production_orders_must_stay_together',
      sql`${table.mustStayTogether} = true`,
    ),
    check('production_orders_positive_version', sql`${table.version} > 0`),
    check(
      'production_orders_bag_count_valid',
      sql`${table.bagCount} is null or ${table.bagCount} >= 0`,
    ),
    check(
      'production_orders_intake_version_nonnegative',
      sql`${table.intakeVersion} >= 0`,
    ),
    check(
      'production_orders_status_valid',
      sql`${table.status} in ('release_pending', 'intake_pending', 'eligible', 'ineligible', 'scheduled', 'finished')`,
    ),
    index('production_orders_location_status_idx').on(
      table.locationId,
      table.status,
    ),
    index('production_orders_location_due_id_idx').on(
      table.locationId,
      table.dueAt,
      table.id,
    ),
    uniqueIndex('production_orders_id_location_unique').on(
      table.id,
      table.locationId,
    ),
    foreignKey({
      name: 'production_orders_order_demand_location_fk',
      columns: [table.orderDemandId, table.locationId],
      foreignColumns: [orderDemands.id, orderDemands.locationId],
    }),
  ],
);

export const productionShiftSelections = pgTable(
  'production_shift_selections',
  {
    productionShiftId: uuid('production_shift_id').primaryKey(),
    locationId: text('location_id').notNull(),
    version: integer('version').notNull().default(1),
    selectedBy: uuid('selected_by').notNull(),
    selectedAt: timestamp('selected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'production_shift_selections_positive_version',
      sql`${table.version} > 0`,
    ),
    uniqueIndex('production_shift_selections_shift_location_unique').on(
      table.productionShiftId,
      table.locationId,
    ),
    foreignKey({
      name: 'production_shift_selections_shift_location_fk',
      columns: [table.productionShiftId, table.locationId],
      foreignColumns: [productionShifts.id, productionShifts.locationId],
    }).onDelete('cascade'),
  ],
);

export const productionShiftSelectedOrders = pgTable(
  'production_shift_selected_orders',
  {
    productionShiftId: uuid('production_shift_id').notNull(),
    locationId: text('location_id').notNull(),
    productionOrderId: uuid('production_order_id').notNull(),
    selectedBy: uuid('selected_by').notNull(),
    selectedAt: timestamp('selected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'production_shift_selected_orders_pk',
      columns: [table.productionShiftId, table.productionOrderId],
    }),
    index('production_shift_selected_orders_location_shift_idx').on(
      table.locationId,
      table.productionShiftId,
    ),
    foreignKey({
      name: 'production_shift_selected_orders_selection_fk',
      columns: [table.productionShiftId, table.locationId],
      foreignColumns: [
        productionShiftSelections.productionShiftId,
        productionShiftSelections.locationId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'production_shift_selected_orders_order_location_fk',
      columns: [table.productionOrderId, table.locationId],
      foreignColumns: [productionOrders.id, productionOrders.locationId],
    }),
  ],
);

export const bags = pgTable(
  'production_bags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productionOrderId: uuid('production_order_id')
      .notNull()
      .references(() => productionOrders.id, { onDelete: 'cascade' }),
    bagIndex: integer('bag_index').notNull(),
    status: text('status').notNull().default('eligible'),
  },
  (table) => [
    uniqueIndex('production_bags_order_index_unique').on(
      table.productionOrderId,
      table.bagIndex,
    ),
    check('production_bags_nonnegative_index', sql`${table.bagIndex} >= 0`),
  ],
);

export const stations = pgTable(
  'production_stations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [
    uniqueIndex('production_stations_kind_unique').on(
      table.locationId,
      table.kind,
    ),
    check(
      'production_stations_known_kind',
      sql`${table.kind} in ('sorting', 'washing', 'drying', 'folding_packaging')`,
    ),
    uniqueIndex('production_stations_id_location_unique').on(
      table.id,
      table.locationId,
    ),
  ],
);

export const machines = pgTable(
  'production_machines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    stationId: uuid('station_id').notNull(),
    label: text('label').notNull(),
    manufacturerCapacityLbs: weight('manufacturer_capacity_lbs'),
    effectiveCapacityLbs: weight('effective_capacity_lbs'),
    capacitySafetyMarginLbs: weight('capacity_safety_margin_lbs'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('production_machines_label_unique').on(
      table.stationId,
      table.label,
    ),
    check(
      'production_machines_effective_capacity_positive',
      sql`${table.effectiveCapacityLbs} is null or ${table.effectiveCapacityLbs} > 0`,
    ),
    uniqueIndex('production_machines_id_location_unique').on(
      table.id,
      table.locationId,
    ),
    foreignKey({
      name: 'production_machines_station_location_fk',
      columns: [table.stationId, table.locationId],
      foreignColumns: [stations.id, stations.locationId],
    }),
  ],
);

export const schedulerConfigs = pgTable(
  'scheduler_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    pulseMinutes: integer('pulse_minutes').notNull(),
    foldLbsPerFolderMinute: weight('fold_lbs_per_folder_minute').notNull(),
    algorithmVersion: text('algorithm_version')
      .notNull()
      .default('fixed-pulse-ffd-v1'),
    version: integer('version').notNull(),
    stageFitAssertion: jsonb('stage_fit_assertion').notNull(),
    assertedBy: uuid('asserted_by').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('scheduler_configs_location_version_unique').on(
      table.locationId,
      table.version,
    ),
    uniqueIndex('scheduler_configs_id_location_unique').on(
      table.id,
      table.locationId,
    ),
    check('scheduler_configs_positive_pulse', sql`${table.pulseMinutes} > 0`),
    check(
      'scheduler_configs_positive_fold_rate',
      sql`${table.foldLbsPerFolderMinute} > 0`,
    ),
  ],
);

export const scheduleRuns = pgTable(
  'schedule_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    productionShiftId: uuid('production_shift_id').notNull(),
    schedulerConfigId: uuid('scheduler_config_id').notNull(),
    status: text('status').notNull().default('draft'),
    inputSnapshot: jsonb('input_snapshot').notNull(),
    inputSnapshotHash: text('input_snapshot_hash').notNull(),
    outputPlan: jsonb('output_plan').notNull(),
    outputPlanHash: text('output_plan_hash').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    pulseCapacityLbs: weight('pulse_capacity_lbs').notNull(),
    batchCount: integer('batch_count').notNull(),
    makespanMinutes: integer('makespan_minutes').notNull(),
    plannedCompletionAt: timestamp('planned_completion_at', {
      withTimezone: true,
    }).notNull(),
    warnings: jsonb('warnings_json')
      .notNull()
      .default(sql`'[]'::jsonb`),
    acknowledgedWarningCodes: jsonb('acknowledged_warning_codes')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('schedule_runs_id_location_unique').on(
      table.id,
      table.locationId,
    ),
    uniqueIndex('schedule_runs_one_current_per_shift_unique')
      .on(table.productionShiftId)
      .where(sql`${table.status} in ('draft', 'accepted')`),
    check(
      'schedule_runs_nonnegative_forecasts',
      sql`${table.batchCount} >= 0 and ${table.makespanMinutes} >= 0 and ${table.pulseCapacityLbs} > 0`,
    ),
    check(
      'schedule_runs_known_status',
      sql`${table.status} in ('draft', 'accepted', 'superseded', 'rejected')`,
    ),
    check(
      'schedule_runs_status_timestamps_valid',
      sql`(${table.status} = 'accepted' and ${table.acceptedAt} is not null and ${table.acceptedBy} is not null and ${table.supersededAt} is null) or (${table.status} = 'draft' and ${table.acceptedAt} is null and ${table.acceptedBy} is null and ${table.supersededAt} is null) or (${table.status} in ('superseded', 'rejected'))`,
    ),
    foreignKey({
      name: 'schedule_runs_shift_location_fk',
      columns: [table.productionShiftId, table.locationId],
      foreignColumns: [productionShifts.id, productionShifts.locationId],
    }),
    foreignKey({
      name: 'schedule_runs_config_location_fk',
      columns: [table.schedulerConfigId, table.locationId],
      foreignColumns: [schedulerConfigs.id, schedulerConfigs.locationId],
    }),
  ],
);

export const productionRuns = pgTable(
  'production_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    productionShiftId: uuid('production_shift_id').notNull(),
    scheduleRunId: uuid('schedule_run_id').notNull(),
    status: text('status').notNull().default('started'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    queueVersion: integer('queue_version').notNull().default(1),
    plannedCompletionAt: timestamp('planned_completion_at', {
      withTimezone: true,
    }).notNull(),
    overtimeProposalHash: text('overtime_proposal_hash'),
    overtimeQueueVersion: integer('overtime_queue_version'),
    overtimeAcknowledgedBy: uuid('overtime_acknowledged_by'),
    overtimeAcknowledgedAt: timestamp('overtime_acknowledged_at', {
      withTimezone: true,
    }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('production_runs_schedule_unique').on(table.scheduleRunId),
    uniqueIndex('production_runs_shift_unique').on(table.productionShiftId),
    uniqueIndex('production_runs_id_location_unique').on(
      table.id,
      table.locationId,
    ),
    check('production_runs_positive_version', sql`${table.version} > 0`),
    check(
      'production_runs_positive_queue_version',
      sql`${table.queueVersion} > 0`,
    ),
    check(
      'production_runs_current_status_valid',
      sql`${table.status} in ('started', 'completed')`,
    ),
    check(
      'production_runs_lifecycle_timestamps_valid',
      sql`${table.startedAt} is not null and ((${table.status} = 'started' and ${table.completedAt} is null) or (${table.status} = 'completed' and ${table.completedAt} is not null))`,
    ),
    check(
      'production_runs_overtime_acknowledgement_paired',
      sql`(${table.overtimeProposalHash} is null and ${table.overtimeQueueVersion} is null and ${table.overtimeAcknowledgedBy} is null and ${table.overtimeAcknowledgedAt} is null) or (${table.overtimeProposalHash} is not null and ${table.overtimeQueueVersion} is not null and ${table.overtimeQueueVersion} > 0 and ${table.overtimeAcknowledgedBy} is not null and ${table.overtimeAcknowledgedAt} is not null)`,
    ),
    foreignKey({
      name: 'production_runs_shift_location_fk',
      columns: [table.productionShiftId, table.locationId],
      foreignColumns: [productionShifts.id, productionShifts.locationId],
    }),
    foreignKey({
      name: 'production_runs_schedule_location_fk',
      columns: [table.scheduleRunId, table.locationId],
      foreignColumns: [scheduleRuns.id, scheduleRuns.locationId],
    }),
  ],
);

export const productionBatches = pgTable(
  'production_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    productionRunId: uuid('production_run_id').notNull(),
    sequenceIndex: integer('sequence_index').notNull(),
    status: text('status').notNull().default('queued'),
    pulseCapacityLbs: weight('pulse_capacity_lbs').notNull(),
    derivedWeightLbs: weight('derived_weight_lbs').notNull(),
    pulseMinutes: integer('pulse_minutes').notNull(),
    plannedDoneAt: timestamp('planned_done_at', {
      withTimezone: true,
    }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    membershipFrozenAt: timestamp('membership_frozen_at', {
      withTimezone: true,
    }),
    membershipFrozenBy: uuid('membership_frozen_by'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('production_batches_id_location_unique').on(
      table.id,
      table.locationId,
    ),
    uniqueIndex('production_batches_sequence_unique').on(
      table.productionRunId,
      table.sequenceIndex,
    ),
    check(
      'production_batches_valid_capacity',
      sql`${table.derivedWeightLbs} > 0 and ${table.derivedWeightLbs} <= ${table.pulseCapacityLbs} and ${table.pulseMinutes} > 0`,
    ),
    check('production_batches_positive_version', sql`${table.version} > 0`),
    check(
      'production_batches_membership_freeze_paired',
      sql`(${table.membershipFrozenAt} is null) = (${table.membershipFrozenBy} is null)`,
    ),
    check(
      'production_batches_nonqueued_membership_frozen',
      sql`${table.status} = 'queued' or (${table.membershipFrozenAt} is not null and ${table.membershipFrozenBy} is not null)`,
    ),
    check(
      'production_batches_lifecycle_timestamps_valid',
      sql`(${table.status} = 'queued' and ${table.startedAt} is null and ${table.finishedAt} is null) or (${table.status} <> 'queued' and ${table.startedAt} is not null and ((${table.status} = 'finished') = (${table.finishedAt} is not null)))`,
    ),
    foreignKey({
      name: 'production_batches_run_location_fk',
      columns: [table.productionRunId, table.locationId],
      foreignColumns: [productionRuns.id, productionRuns.locationId],
    }).onDelete('cascade'),
  ],
);

export const productionBatchOrders = pgTable(
  'production_batch_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    productionBatchId: uuid('production_batch_id').notNull(),
    productionOrderId: uuid('production_order_id').notNull(),
    active: boolean('active').notNull().default(true),
    placementProvenance: text('placement_provenance')
      .notNull()
      .default('initial_schedule'),
    placedAt: timestamp('placed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    placedBy: uuid('placed_by'),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    pinnedBy: uuid('pinned_by'),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releasedBy: uuid('released_by'),
    releaseReason: text('release_reason'),
  },
  (table) => [
    uniqueIndex('production_batch_orders_active_unique')
      .on(table.productionOrderId)
      .where(sql`${table.active} = true`),
    index('production_batch_orders_order_history_idx').on(
      table.productionOrderId,
      table.placedAt,
    ),
    check(
      'production_batch_orders_known_placement_provenance',
      sql`${table.placementProvenance} in ('initial_schedule', 'automatic', 'manager_exact', 'manual_rebatch', 'exception_route')`,
    ),
    check(
      'production_batch_orders_pin_valid',
      sql`(${table.placementProvenance} in ('manager_exact', 'manual_rebatch') and ${table.pinnedAt} is not null and ${table.pinnedBy} is not null) or (${table.placementProvenance} not in ('manager_exact', 'manual_rebatch') and ${table.pinnedAt} is null and ${table.pinnedBy} is null)`,
    ),
    check(
      'production_batch_orders_release_valid',
      sql`(${table.releasedAt} is null and ${table.releasedBy} is null and ${table.releaseReason} is null) or (${table.active} = false and ${table.releasedAt} is not null and ${table.releasedBy} is not null and ${table.releaseReason} is not null)`,
    ),
    foreignKey({
      name: 'production_batch_orders_batch_location_fk',
      columns: [table.productionBatchId, table.locationId],
      foreignColumns: [productionBatches.id, productionBatches.locationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'production_batch_orders_order_location_fk',
      columns: [table.productionOrderId, table.locationId],
      foreignColumns: [productionOrders.id, productionOrders.locationId],
    }),
  ],
);

export const stageRuns = pgTable(
  'stage_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    productionBatchId: uuid('production_batch_id').notNull(),
    stationId: uuid('station_id').notNull(),
    stageKind: text('stage_kind').notNull(),
    status: text('status').notNull().default('planned'),
    plannedStartAt: timestamp('planned_start_at', {
      withTimezone: true,
    }).notNull(),
    plannedEndAt: timestamp('planned_end_at', {
      withTimezone: true,
    }).notNull(),
    actualStartAt: timestamp('actual_start_at', { withTimezone: true }),
    actualEndAt: timestamp('actual_end_at', { withTimezone: true }),
    actualStartProvenance: stageBoundaryProvenanceEnum(
      'actual_start_provenance',
    )
      .notNull()
      .default('not_recorded'),
    actualEndProvenance: stageBoundaryProvenanceEnum('actual_end_provenance')
      .notNull()
      .default('not_recorded'),
    startedBy: uuid('started_by'),
    completedBy: uuid('completed_by'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('stage_runs_id_location_unique').on(table.id, table.locationId),
    uniqueIndex('stage_runs_batch_stage_unique').on(
      table.productionBatchId,
      table.stageKind,
    ),
    uniqueIndex('stage_runs_one_active_station_unique')
      .on(table.stationId)
      .where(sql`${table.status} = 'started'`),
    check(
      'stage_runs_planned_window_valid',
      sql`${table.plannedEndAt} > ${table.plannedStartAt}`,
    ),
    check(
      'stage_runs_known_stage',
      sql`${table.stageKind} in ('sorting', 'washing', 'drying', 'folding_packaging')`,
    ),
    check(
      'stage_runs_actual_start_provenance_valid',
      sql`(${table.actualStartAt} is null and ${table.actualStartProvenance} = 'not_recorded') or (${table.actualStartAt} is not null and ${table.actualStartProvenance} in ('live_observed', 'operator_reported'))`,
    ),
    check(
      'stage_runs_actual_end_provenance_valid',
      sql`(${table.actualEndAt} is null and ${table.actualEndProvenance} = 'not_recorded') or (${table.actualEndAt} is not null and ${table.actualEndProvenance} in ('live_observed', 'operator_reported'))`,
    ),
    check(
      'stage_runs_actual_window_valid',
      sql`${table.actualStartAt} is null or ${table.actualEndAt} is null or ${table.actualEndAt} >= ${table.actualStartAt}`,
    ),
    foreignKey({
      name: 'stage_runs_batch_location_fk',
      columns: [table.productionBatchId, table.locationId],
      foreignColumns: [productionBatches.id, productionBatches.locationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'stage_runs_station_location_fk',
      columns: [table.stationId, table.locationId],
      foreignColumns: [stations.id, stations.locationId],
    }),
  ],
);

export const stageMachineAssignments = pgTable(
  'stage_machine_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    stageRunId: uuid('stage_run_id').notNull(),
    machineId: uuid('machine_id').notNull(),
    plannedStartAt: timestamp('planned_start_at', {
      withTimezone: true,
    }).notNull(),
    plannedEndAt: timestamp('planned_end_at', {
      withTimezone: true,
    }).notNull(),
    actualStartAt: timestamp('actual_start_at', { withTimezone: true }),
    actualEndAt: timestamp('actual_end_at', { withTimezone: true }),
    status: text('status').notNull().default('planned'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('stage_machine_assignments_stage_machine_unique').on(
      table.stageRunId,
      table.machineId,
    ),
    check(
      'stage_machine_assignments_window_valid',
      sql`${table.plannedEndAt} > ${table.plannedStartAt}`,
    ),
    foreignKey({
      name: 'stage_machine_assignments_stage_location_fk',
      columns: [table.stageRunId, table.locationId],
      foreignColumns: [stageRuns.id, stageRuns.locationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'stage_machine_assignments_machine_location_fk',
      columns: [table.machineId, table.locationId],
      foreignColumns: [machines.id, machines.locationId],
    }),
  ],
);

/**
 * An order route is the ordered set of immutable attempts through physical
 * stage slots. Stage runs remain the batch-level floor truth; these rows make
 * exceptions such as extra drying and rewash explicit without rewriting the
 * stages an order already completed.
 */
export const productionOrderStageAttempts = pgTable(
  'production_order_stage_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    productionRunId: uuid('production_run_id').notNull(),
    productionOrderId: uuid('production_order_id').notNull(),
    stageRunId: uuid('stage_run_id').notNull(),
    stageKind: text('stage_kind').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    status: text('status').notNull().default('assigned'),
    assignmentReason: text('assignment_reason').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    assignedBy: uuid('assigned_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by'),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releasedBy: uuid('released_by'),
    releaseReason: text('release_reason'),
    metadata: jsonb('metadata_json')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('production_order_stage_attempts_order_stage_number_unique').on(
      table.productionOrderId,
      table.stageKind,
      table.attemptNumber,
    ),
    uniqueIndex('production_order_stage_attempts_one_assigned_unique')
      .on(table.productionOrderId, table.stageKind)
      .where(sql`${table.status} = 'assigned'`),
    index('production_order_stage_attempts_stage_idx').on(
      table.stageRunId,
      table.status,
    ),
    index('production_order_stage_attempts_order_idx').on(
      table.productionOrderId,
      table.assignedAt,
    ),
    check(
      'production_order_stage_attempts_known_stage',
      sql`${table.stageKind} in ('sorting', 'washing', 'drying', 'folding_packaging')`,
    ),
    check(
      'production_order_stage_attempts_positive_number',
      sql`${table.attemptNumber} > 0`,
    ),
    check(
      'production_order_stage_attempts_known_status',
      sql`${table.status} in ('assigned', 'completed', 'released')`,
    ),
    check(
      'production_order_stage_attempts_known_assignment_reason',
      sql`${table.assignmentReason} in ('initial_schedule', 'automatic', 'manager_exact', 'manual_rebatch', 'needs_more_drying', 'rewash_required', 'sorting_incomplete', 'stage_incomplete', 'other')`,
    ),
    check(
      'production_order_stage_attempts_lifecycle_valid',
      sql`(${table.status} = 'assigned' and ${table.completedAt} is null and ${table.completedBy} is null and ${table.releasedAt} is null and ${table.releasedBy} is null and ${table.releaseReason} is null) or (${table.status} = 'completed' and ${table.completedAt} is not null and ${table.releasedAt} is null and ${table.releasedBy} is null and ${table.releaseReason} is null) or (${table.status} = 'released' and ${table.completedAt} is null and ${table.completedBy} is null and ${table.releasedAt} is not null and ${table.releasedBy} is not null and ${table.releaseReason} is not null)`,
    ),
    foreignKey({
      name: 'production_order_stage_attempts_run_location_fk',
      columns: [table.productionRunId, table.locationId],
      foreignColumns: [productionRuns.id, productionRuns.locationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'production_order_stage_attempts_order_location_fk',
      columns: [table.productionOrderId, table.locationId],
      foreignColumns: [productionOrders.id, productionOrders.locationId],
    }),
    foreignKey({
      name: 'production_order_stage_attempts_stage_location_fk',
      columns: [table.stageRunId, table.locationId],
      foreignColumns: [stageRuns.id, stageRuns.locationId],
    }),
  ],
);

export const workEvents = pgTable(
  'work_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locationId: text('location_id')
      .notNull()
      .references(() => productionLocations.id),
    eventType: text('event_type').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    expectedVersion: integer('expected_version'),
    idempotencyKey: text('idempotency_key').notNull(),
    payload: jsonb('payload_json')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('work_events_idempotency_unique').on(table.idempotencyKey),
    index('work_events_entity_idx').on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    index('work_events_location_created_id_idx').on(
      table.locationId,
      table.createdAt,
      table.id,
    ),
  ],
);
