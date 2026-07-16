import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const requiredUrl = (name: string): string => {
  const value = process.env[name];
  if (value) return value;
  throw new Error(
    `${name} is required for LPMS persistence integration tests.`,
  );
};

const runtime = postgres(requiredUrl('PRESSLY_TEST_RUNTIME_DATABASE_URL'), {
  max: 2,
});
const migration = postgres(requiredUrl('PRESSLY_TEST_MIGRATION_DATABASE_URL'), {
  max: 1,
});

const ids = {
  actor: '00000000-0000-4000-8000-000000000001',
  shift: '00000000-0000-4000-8000-000000000002',
  config: '00000000-0000-4000-8000-000000000003',
  schedule: '00000000-0000-4000-8000-000000000004',
  run: '00000000-0000-4000-8000-000000000005',
  runTwo: '00000000-0000-4000-8000-000000000006',
  batch: '00000000-0000-4000-8000-000000000007',
  batchTwo: '00000000-0000-4000-8000-000000000008',
  washStation: '00000000-0000-4000-8000-000000000009',
  washer: '00000000-0000-4000-8000-000000000010',
  stage: '00000000-0000-4000-8000-000000000011',
  stageTwo: '00000000-0000-4000-8000-000000000012',
  configTwo: '00000000-0000-4000-8000-000000000013',
  configThree: '00000000-0000-4000-8000-000000000014',
  orderDemand: '00000000-0000-4000-8000-000000000015',
  productionOrder: '00000000-0000-4000-8000-000000000016',
  workEvent: '00000000-0000-4000-8000-000000000017',
  scheduleTwo: '00000000-0000-4000-8000-000000000018',
} as const;

const locations = {
  first: 'location-1',
  second: 'location-2',
} as const;

const lpmsTables = [
  'work_events',
  'stage_machine_assignments',
  'stage_runs',
  'production_batch_orders',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'scheduler_configs',
  'production_machines',
  'production_stations',
  'production_bags',
  'production_orders',
  'production_shifts',
  'order_demands',
  'webhook_events',
  'source_location_bindings',
  'production_locations',
] as const;

const seedLocations = async (): Promise<void> => {
  await runtime`
    insert into production_locations (id, name, timezone)
    values
      (${locations.first}, 'Synthetic Facility One', 'America/New_York'),
      (${locations.second}, 'Synthetic Facility Two', 'America/Chicago')
  `;
};

const seedExecution = async (
  input: {
    locationsSeeded?: boolean;
  } = {},
): Promise<void> => {
  if (input.locationsSeeded !== true) await seedLocations();
  await runtime`
    insert into production_shifts (
      id, location_id, starts_at, ends_at, timezone, effective_folder_count
    ) values (
      ${ids.shift}, ${locations.first}, '2026-07-10T14:00:00Z',
      '2026-07-10T20:00:00Z', 'America/New_York', 2
    )
  `;
  await runtime`
    insert into scheduler_configs (
      id, location_id, pulse_minutes, fold_lbs_per_folder_minute, version,
      stage_fit_assertion, asserted_by
    ) values (
      ${ids.config}, ${locations.first}, 56, 2, 1,
      ${runtime.json({ sorting: true, washing: true, drying: true })},
      ${ids.actor}
    )
  `;
  await runtime`
    insert into schedule_runs (
      id, location_id, production_shift_id, scheduler_config_id, input_snapshot,
      input_snapshot_hash, output_plan, output_plan_hash, algorithm_version,
      pulse_capacity_lbs, batch_count, makespan_minutes, planned_completion_at
    ) values (
      ${ids.schedule}, ${locations.first}, ${ids.shift}, ${ids.config}, ${runtime.json({})},
      'input-hash', ${runtime.json({})}, 'output-hash', 'fixed-pulse-ffd-v1',
      224, 2, 280, '2026-07-10T18:40:00Z'
    )
  `;
  await runtime`
    insert into production_runs (
      id, location_id, production_shift_id, schedule_run_id, started_at,
      planned_completion_at
    ) values (
      ${ids.run}, ${locations.first}, ${ids.shift}, ${ids.schedule},
      '2026-07-10T14:00:00Z', '2026-07-10T18:40:00Z'
    )
  `;
  await runtime`
    insert into production_batches (
      id, location_id, production_run_id, sequence_index, pulse_capacity_lbs,
      derived_weight_lbs, pulse_minutes, planned_done_at
    ) values
      (${ids.batch}, ${locations.first}, ${ids.run}, 0, 224, 200, 56, '2026-07-10T17:44:00Z'),
      (${ids.batchTwo}, ${locations.first}, ${ids.run}, 1, 224, 180, 56, '2026-07-10T18:40:00Z')
  `;
  await runtime`
    insert into production_stations (
      id, location_id, kind, label, sort_order
    ) values (${ids.washStation}, ${locations.first}, 'washing', 'Wash', 2)
  `;
  await runtime`
    insert into production_machines (
      id, location_id, station_id, label, manufacturer_capacity_lbs,
      effective_capacity_lbs, capacity_safety_margin_lbs
    ) values (
      ${ids.washer}, ${locations.first}, ${ids.washStation}, 'W-01', 60, 60, 0
    )
  `;
  await runtime`
    insert into stage_runs (
      id, location_id, production_batch_id, station_id, stage_kind, planned_start_at,
      planned_end_at
    ) values
      (${ids.stage}, ${locations.first}, ${ids.batch}, ${ids.washStation}, 'washing',
       '2026-07-10T14:56:00Z', '2026-07-10T15:52:00Z'),
      (${ids.stageTwo}, ${locations.first}, ${ids.batchTwo}, ${ids.washStation}, 'washing',
       '2026-07-10T15:20:00Z', '2026-07-10T16:16:00Z')
  `;
};

beforeEach(async () => {
  await migration.unsafe(
    `truncate table ${lpmsTables.join(', ')} restart identity cascade`,
  );
});

afterAll(async () => {
  await Promise.all([runtime.end(), migration.end()]);
});

describe('LPMS database invariants', () => {
  it('deduplicates minimized source events and retains source ordering facts', async () => {
    await runtime`
      insert into webhook_events (
        source, subject_type, event_type, dedupe_key, subject_id,
        source_location_id, source_occurred_at, payload_json, payload_hash,
        raw_body_sha256
      ) values (
        'cents', 'order', 'order.updated', 'delivery-1', 'order-1', 'store-1',
        '2026-07-10T14:00:00Z',
        ${runtime.json({ order: { externalOrderId: 'order-1' } })},
        'canonical-hash-1', 'raw-hash-1'
      )
    `;

    await expect(
      runtime`
        insert into webhook_events (
          source, subject_type, event_type, dedupe_key, payload_hash,
          raw_body_sha256
        ) values (
          'cents', 'order', 'order.updated', 'delivery-1',
          'canonical-hash-2', 'raw-hash-2'
        )
      `,
    ).rejects.toThrow(/webhook_events_dedupe_unique/);

    const [stored] = await runtime`
      select payload_hash, raw_body_sha256, source_occurred_at
      from webhook_events
      where source = 'cents' and dedupe_key = 'delivery-1'
    `;
    expect(stored).toMatchObject({
      payload_hash: 'canonical-hash-1',
      raw_body_sha256: 'raw-hash-1',
      source_occurred_at: new Date('2026-07-10T14:00:00Z'),
    });
  });

  it('stores ignored events without source payloads', async () => {
    await runtime`
      insert into webhook_events (
        source, subject_type, event_type, dedupe_key, subject_id,
        raw_body_sha256, status, processed_at
      ) values (
        'cents', 'customer', 'customer.updated', 'customer-delivery-1',
        'customer-synthetic-1', 'raw-hash-customer-1', 'processed',
        '2026-07-10T14:00:00Z'
      )
    `;

    const [stored] = await runtime`
      select subject_type, payload_json, payload_hash, source_location_id,
             raw_body_sha256
      from webhook_events
      where dedupe_key = 'customer-delivery-1'
    `;
    expect(stored).toEqual({
      subject_type: 'customer',
      payload_json: null,
      payload_hash: null,
      source_location_id: null,
      raw_body_sha256: 'raw-hash-customer-1',
    });
  });

  it('retains equal-timestamp digests so divergence remains detectable', async () => {
    await runtime`
      insert into webhook_events (
        source, subject_type, event_type, dedupe_key, subject_id,
        source_location_id, source_occurred_at, payload_json, payload_hash,
        raw_body_sha256
      ) values
        (
          'cents', 'order', 'order.updated', 'delivery-equal-1', 'order-equal',
          'store-1', '2026-07-10T14:00:00Z',
          ${runtime.json({ status: 'IN_PROGRESS' })}, 'canonical-equal-1',
          'raw-equal-1'
        ),
        (
          'cents', 'order', 'order.updated', 'delivery-equal-2', 'order-equal',
          'store-1', '2026-07-10T14:00:00Z',
          ${runtime.json({ status: 'CANCELLED' })}, 'canonical-equal-2',
          'raw-equal-2'
        )
    `;

    const stored = await runtime`
      select source_occurred_at, payload_hash
      from webhook_events
      where subject_id = 'order-equal'
      order by dedupe_key
    `;
    expect(stored).toEqual([
      {
        source_occurred_at: new Date('2026-07-10T14:00:00Z'),
        payload_hash: 'canonical-equal-1',
      },
      {
        source_occurred_at: new Date('2026-07-10T14:00:00Z'),
        payload_hash: 'canonical-equal-2',
      },
    ]);
  });

  it('maps each source location to exactly one known production location', async () => {
    await seedLocations();
    await runtime`
      insert into source_location_bindings (
        source, external_location_id, location_id
      ) values
        ('cents', 'store-1', ${locations.first}),
        ('cents', 'store-2', ${locations.first})
    `;

    await expect(
      runtime`
        insert into source_location_bindings (
          source, external_location_id, location_id
        ) values ('cents', 'store-1', ${locations.second})
      `,
    ).rejects.toThrow(
      /source_location_bindings_source_external_location_id_pk/,
    );

    await expect(
      runtime`
        insert into source_location_bindings (
          source, external_location_id, location_id
        ) values ('cents', 'unknown-store', 'missing-location')
      `,
    ).rejects.toThrow(
      /source_location_bindings_location_id_production_locations_id_fk/,
    );
  });

  it('scopes scheduler versions and work-event facts to known locations', async () => {
    await seedLocations();
    let resolveNotification!: (payload: string) => void;
    const notification = new Promise<string>((resolve) => {
      resolveNotification = resolve;
    });
    const listener = await runtime.listen(
      'pressly_production_changes',
      resolveNotification,
    );
    const assertion = runtime.json({
      sorting: true,
      washing: true,
      drying: true,
    });
    await runtime`
      insert into scheduler_configs (
        id, location_id, pulse_minutes, fold_lbs_per_folder_minute, version,
        stage_fit_assertion, asserted_by
      ) values
        (${ids.config}, ${locations.first}, 56, 2, 1, ${assertion}, ${ids.actor}),
        (${ids.configTwo}, ${locations.second}, 56, 2, 1, ${assertion}, ${ids.actor})
    `;

    await expect(
      runtime`
        insert into scheduler_configs (
          id, location_id, pulse_minutes, fold_lbs_per_folder_minute, version,
          stage_fit_assertion, asserted_by
        ) values (
          ${ids.configThree}, ${locations.first}, 56, 2, 1,
          ${assertion}, ${ids.actor}
        )
      `,
    ).rejects.toThrow(/scheduler_configs_location_version_unique/);

    await runtime`
      insert into work_events (
        id, location_id, event_type, entity_type, entity_id, actor_id,
        idempotency_key
      ) values (
        ${ids.workEvent}, ${locations.first}, 'production.order.intake_recorded',
        'production_order', ${ids.productionOrder}, ${ids.actor},
        'synthetic-intake-1'
      )
    `;
    const [event] = await runtime`
      select location_id from work_events where id = ${ids.workEvent}
    `;
    expect(event?.['location_id']).toBe(locations.first);
    const [location] = await runtime`
      select live_revision from production_locations
      where id = ${locations.first}
    `;
    expect(Number(location?.['live_revision'])).toBe(1);
    await expect(
      notification.then((payload) => JSON.parse(payload)),
    ).resolves.toEqual({
      locationId: locations.first,
      revision: 1,
    });
    await listener.unlisten();

    await expect(
      runtime`
        insert into work_events (
          location_id, event_type, entity_type, entity_id, actor_id,
          idempotency_key
        ) values (
          'missing-location', 'production.order.intake_recorded',
          'production_order', ${ids.productionOrder}, ${ids.actor},
          'synthetic-intake-2'
        )
      `,
    ).rejects.toThrow(/work_events_location_id_production_locations_id_fk/);
  });

  it('publishes a live revision only after its work-event transaction commits', async () => {
    await seedLocations();
    const notifications: unknown[] = [];
    let resolveCommitted!: () => void;
    const committed = new Promise<void>((resolve) => {
      resolveCommitted = resolve;
    });
    const listener = await runtime.listen(
      'pressly_production_changes',
      (payload) => {
        notifications.push(JSON.parse(payload));
        resolveCommitted();
      },
    );

    await expect(
      runtime.begin(async (transaction) => {
        await transaction`
          insert into work_events (
            id, location_id, event_type, entity_type, entity_id, actor_id,
            idempotency_key
          ) values (
            ${ids.workEvent}, ${locations.first}, 'production.order.intake_recorded',
            'production_order', ${ids.productionOrder}, ${ids.actor},
            'rolled-back-intake'
          )
        `;
        throw new Error('roll back synthetic work event');
      }),
    ).rejects.toThrow('roll back synthetic work event');

    const [afterRollback] = await runtime`
      select live_revision from production_locations where id = ${locations.first}
    `;
    expect(Number(afterRollback?.['live_revision'])).toBe(0);
    expect(notifications).toEqual([]);

    await runtime`
      insert into work_events (
        id, location_id, event_type, entity_type, entity_id, actor_id,
        idempotency_key
      ) values (
        ${ids.workEvent}, ${locations.first}, 'production.order.intake_recorded',
        'production_order', ${ids.productionOrder}, ${ids.actor},
        'committed-intake'
      )
    `;
    await committed;
    expect(notifications).toEqual([
      { locationId: locations.first, revision: 1 },
    ]);
    await listener.unlisten();
  });

  it('represents missing bag intake as nullable, versioned production truth', async () => {
    await seedLocations();
    await runtime`
      insert into order_demands (
        id, demand_key, display_reference, location_id, revision_hash,
        revision_at, status, due_at
      ) values (
        ${ids.orderDemand}, 'synthetic:order:1', 'synthetic-order-1',
        ${locations.first}, 'source-hash-1', '2026-07-10T14:00:00Z',
        'ready_for_production',
        '2026-07-10T20:00:00Z'
      )
    `;
    await runtime`
      insert into production_orders (
        id, order_demand_id, location_id, due_at, status, derived_weight_lbs,
        bag_count, bag_count_source, intake_recorded_at, eligible_at
      ) values (
        ${ids.productionOrder}, ${ids.orderDemand}, ${locations.first},
        '2026-07-10T20:00:00Z', 'intake_pending', 80,
        null, null, null, '2026-07-10T14:00:00Z'
      )
    `;

    const [stored] = await runtime`
      select location_id, bag_count, bag_count_source, intake_recorded_at,
             intake_version
      from production_orders where id = ${ids.productionOrder}
    `;
    expect(stored).toEqual({
      location_id: locations.first,
      bag_count: null,
      bag_count_source: null,
      intake_recorded_at: null,
      intake_version: 0,
    });

    await expect(
      runtime`
        update production_orders
        set bag_count = -1
        where id = ${ids.productionOrder}
      `,
    ).rejects.toThrow(/production_orders_bag_count_valid/);
  });

  it('rejects cross-location order and schedule relationships', async () => {
    await seedLocations();
    await runtime`
      insert into order_demands (
        id, demand_key, display_reference, location_id, revision_hash,
        revision_at, status, due_at
      ) values (
        ${ids.orderDemand}, 'synthetic:order:cross-location',
        'cross-location-order', ${locations.first},
        'source-hash-cross-location', '2026-07-10T14:00:00Z',
        'ready_for_production', '2026-07-10T20:00:00Z'
      )
    `;
    await expect(
      runtime`
        insert into production_orders (
          id, order_demand_id, location_id, due_at, status, derived_weight_lbs,
          eligible_at
        ) values (
          ${ids.productionOrder}, ${ids.orderDemand}, ${locations.second},
          '2026-07-10T20:00:00Z', 'intake_pending', 80,
          '2026-07-10T14:00:00Z'
        )
      `,
    ).rejects.toThrow(/production_orders_order_demand_location_fk/);

    await runtime`
      insert into production_shifts (
        id, location_id, starts_at, ends_at, timezone, effective_folder_count
      ) values (
        ${ids.shift}, ${locations.first}, '2026-07-10T14:00:00Z',
        '2026-07-10T20:00:00Z', 'America/New_York', 2
      )
    `;
    await runtime`
      insert into scheduler_configs (
        id, location_id, pulse_minutes, fold_lbs_per_folder_minute, version,
        stage_fit_assertion, asserted_by
      ) values (
        ${ids.config}, ${locations.second}, 56, 2, 1,
        ${runtime.json({ sorting: true, washing: true, drying: true })},
        ${ids.actor}
      )
    `;
    await expect(
      runtime`
        insert into schedule_runs (
          id, location_id, production_shift_id, scheduler_config_id,
          input_snapshot, input_snapshot_hash, output_plan, output_plan_hash,
          algorithm_version, pulse_capacity_lbs, batch_count,
          makespan_minutes, planned_completion_at
        ) values (
          ${ids.schedule}, ${locations.first}, ${ids.shift}, ${ids.config},
          ${runtime.json({})}, 'cross-location-input', ${runtime.json({})},
          'cross-location-output', 'fixed-pulse-ffd-v1', 224, 1, 224,
          '2026-07-10T17:44:00Z'
        )
      `,
    ).rejects.toThrow(/schedule_runs_config_location_fk/);
  });

  it('creates at most one current plan and one production run per shift', async () => {
    await seedExecution();

    await expect(
      runtime`
        insert into schedule_runs (
          id, location_id, production_shift_id, scheduler_config_id,
          input_snapshot, input_snapshot_hash, output_plan, output_plan_hash,
          algorithm_version, pulse_capacity_lbs, batch_count,
          makespan_minutes, planned_completion_at
        ) values (
          ${ids.scheduleTwo}, ${locations.first}, ${ids.shift}, ${ids.config},
          ${runtime.json({})}, 'input-hash-two', ${runtime.json({})},
          'output-hash-two', 'fixed-pulse-ffd-v2', 224, 1, 224,
          '2026-07-10T17:44:00Z'
        )
      `,
    ).rejects.toThrow(/schedule_runs_one_current_per_shift_unique/);

    await runtime`
      update schedule_runs
      set status = 'superseded', superseded_at = now()
      where id = ${ids.schedule}
    `;
    await runtime`
      insert into schedule_runs (
        id, location_id, production_shift_id, scheduler_config_id, status,
        input_snapshot, input_snapshot_hash, output_plan, output_plan_hash,
        algorithm_version, pulse_capacity_lbs, batch_count,
        makespan_minutes, planned_completion_at, superseded_at
      ) values (
        ${ids.scheduleTwo}, ${locations.first}, ${ids.shift}, ${ids.config},
        'superseded', ${runtime.json({})}, 'input-hash-two',
        ${runtime.json({})}, 'output-hash-two', 'fixed-pulse-ffd-v2', 224,
        1, 224, '2026-07-10T17:44:00Z', now()
      )
    `;

    await expect(
      runtime`
        insert into production_runs (
          id, location_id, production_shift_id, schedule_run_id, started_at,
          planned_completion_at
        ) values (
          ${ids.runTwo}, ${locations.first}, ${ids.shift}, ${ids.scheduleTwo},
          '2026-07-10T14:00:00Z', '2026-07-10T17:44:00Z'
        )
      `,
    ).rejects.toThrow(/production_runs_shift_unique/);
  });

  it('enforces queue, overtime, and membership-freeze state at rest', async () => {
    await seedExecution();

    await expect(
      runtime`update production_runs set queue_version = 0 where id = ${ids.run}`,
    ).rejects.toThrow(/production_runs_positive_queue_version/);
    await expect(
      runtime`
        update production_runs
        set overtime_proposal_hash = ${'a'.repeat(64)}
        where id = ${ids.run}
      `,
    ).rejects.toThrow(/production_runs_overtime_acknowledgement_paired/);
    await expect(
      runtime`
        update production_batches
        set status = 'sorting', started_at = now()
        where id = ${ids.batch}
      `,
    ).rejects.toThrow(/production_batches_nonqueued_membership_frozen/);

    await expect(
      runtime`
        update production_batches
        set status = 'sorting', started_at = now(), membership_frozen_at = now(),
            membership_frozen_by = ${ids.actor}
        where id = ${ids.batch}
        returning id
      `,
    ).resolves.toHaveLength(1);
  });

  it('rejects machine overlap while allowing adjacent pulse windows', async () => {
    await seedExecution();
    await runtime`
      insert into stage_machine_assignments (
        location_id, stage_run_id, machine_id, planned_start_at, planned_end_at
      ) values (
        ${locations.first}, ${ids.stage}, ${ids.washer},
        '2026-07-10T14:56:00Z', '2026-07-10T15:52:00Z'
      )
    `;

    await expect(
      runtime`
        insert into stage_machine_assignments (
          location_id, stage_run_id, machine_id, planned_start_at, planned_end_at
        ) values (
          ${locations.first}, ${ids.stageTwo}, ${ids.washer},
          '2026-07-10T15:20:00Z', '2026-07-10T16:16:00Z'
        )
      `,
    ).rejects.toThrow(/stage_machine_assignments_no_overlap/);

    await runtime`
      update stage_runs
      set planned_start_at = '2026-07-10T15:52:00Z',
          planned_end_at = '2026-07-10T16:48:00Z'
      where id = ${ids.stageTwo}
    `;
    await expect(
      runtime`
        insert into stage_machine_assignments (
          location_id, stage_run_id, machine_id, planned_start_at, planned_end_at
        ) values (
          ${locations.first}, ${ids.stageTwo}, ${ids.washer},
          '2026-07-10T15:52:00Z', '2026-07-10T16:48:00Z'
        )
        returning stage_run_id
      `,
    ).resolves.toHaveLength(1);
  });

  it('allows only one active batch at a station', async () => {
    await seedExecution();
    await runtime`update stage_runs set status = 'started' where id = ${ids.stage}`;

    await expect(
      runtime`update stage_runs set status = 'started' where id = ${ids.stageTwo}`,
    ).rejects.toThrow(/stage_runs_one_active_station_unique/);
  });

  it('rejects non-positive pulse and overweight batches', async () => {
    await seedLocations();
    await expect(
      runtime`
        insert into scheduler_configs (
          location_id, pulse_minutes, fold_lbs_per_folder_minute, version,
          stage_fit_assertion, asserted_by
        ) values (
          ${locations.first}, 0, 2, 1, ${runtime.json({})}, ${ids.actor}
        )
      `,
    ).rejects.toThrow(/scheduler_configs_positive_pulse/);

    await seedExecution({ locationsSeeded: true });
    await expect(
      runtime`
        insert into production_batches (
          location_id, production_run_id, sequence_index, pulse_capacity_lbs,
          derived_weight_lbs, pulse_minutes, planned_done_at
        ) values (
          ${locations.first}, ${ids.run}, 3, 224, 225, 56,
          '2026-07-10T20:00:00Z'
        )
      `,
    ).rejects.toThrow(/production_batches_valid_capacity/);
  });
});
