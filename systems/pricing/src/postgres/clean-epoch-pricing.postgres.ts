import { sha256Text } from '@pressly/codec/node';
import { isAppError, isRecord } from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';

export const exactPricingEpochTableOrder = Object.freeze([
  'pricing_services',
  'pricing_sets',
  'pricing_items',
  'pricing_change_events',
] as const);

export type ExactPricingEpochRowCounts = Readonly<{
  services: number;
  sets: number;
  items: number;
  changeEvents: number;
}>;

export type ExactPricingEpochSnapshot = Readonly<{
  servicesJson: string;
  setsJson: string;
  itemsJson: string;
  changeEventsJson: string;
  rowCounts: ExactPricingEpochRowCounts;
  sha256: string;
}>;

type SnapshotPayloadRow = Readonly<{
  payload: unknown;
  row_count: unknown;
}>;

const fail = (
  code: string,
  message: string,
  details?: unknown,
  cause?: unknown,
): never => {
  throw invariantViolationError({
    code,
    message,
    safeMessage: 'Exact Pricing preservation failed.',
    ...(details === undefined ? {} : { details }),
    ...(cause === undefined ? {} : { cause }),
  });
};

const readPayload = (
  rows: Iterable<SnapshotPayloadRow>,
  table: (typeof exactPricingEpochTableOrder)[number],
): Readonly<{ json: string; values: readonly unknown[]; count: number }> => {
  const [row, ...unexpected] = Array.from(rows);
  if (
    row === undefined ||
    unexpected.length !== 0 ||
    typeof row.payload !== 'string'
  )
    return fail(
      'pricing_epoch_snapshot_shape_invalid',
      `Pricing epoch snapshot query for ${table} returned an invalid shape.`,
      { table },
    );

  const count =
    typeof row.row_count === 'number'
      ? row.row_count
      : typeof row.row_count === 'string'
        ? Number(row.row_count)
        : Number.NaN;
  if (!Number.isSafeInteger(count) || count < 0)
    return fail(
      'pricing_epoch_snapshot_count_invalid',
      `Pricing epoch snapshot query for ${table} returned an invalid count.`,
      { table },
    );

  let values: unknown;
  try {
    values = JSON.parse(row.payload) as unknown;
  } catch (cause) {
    return fail(
      'pricing_epoch_snapshot_json_invalid',
      `Pricing epoch snapshot query for ${table} returned invalid JSON.`,
      { table },
      cause,
    );
  }
  if (!Array.isArray(values) || values.length !== count)
    return fail(
      'pricing_epoch_snapshot_count_mismatch',
      `Pricing epoch snapshot query for ${table} returned inconsistent data.`,
      { actual: Array.isArray(values) ? values.length : null, count, table },
    );

  return Object.freeze({ json: row.payload, values, count });
};

const requiredText = (
  value: unknown,
  field: string,
  table: string,
  position: number,
): string => {
  if (isRecord(value) && typeof value[field] === 'string') return value[field];
  return fail(
    'pricing_epoch_snapshot_row_invalid',
    `Pricing epoch snapshot row ${position} in ${table} has an invalid ${field}.`,
    { field, position, table },
  );
};

const assertCompatibleWithCleanPricingConstraints = (
  sets: readonly unknown[],
  items: readonly unknown[],
): void => {
  const activeServiceIds = new Set<string>();
  sets.forEach((set, position) => {
    if (requiredText(set, 'status', 'pricing_sets', position) !== 'active')
      return;
    const serviceId = requiredText(set, 'serviceId', 'pricing_sets', position);
    if (activeServiceIds.has(serviceId))
      fail(
        'pricing_epoch_active_set_conflict',
        'Legacy Pricing contains more than one active set for a service.',
        { serviceId },
      );
    activeServiceIds.add(serviceId);
  });

  const itemKeys = new Set<string>();
  items.forEach((item, position) => {
    const pricingSetId = requiredText(
      item,
      'pricingSetId',
      'pricing_items',
      position,
    );
    const code = requiredText(item, 'code', 'pricing_items', position);
    const key = `${pricingSetId}\u0000${code}`;
    if (itemKeys.has(key))
      fail(
        'pricing_epoch_item_code_conflict',
        'Legacy Pricing contains a duplicate item code within one set.',
        { code, pricingSetId },
      );
    itemKeys.add(key);
  });
};

const snapshotSha256 = (input: {
  readonly servicesJson: string;
  readonly setsJson: string;
  readonly itemsJson: string;
  readonly changeEventsJson: string;
}): string =>
  sha256Text(
    `pricing-services\n${input.servicesJson}\n` +
      `pricing-sets\n${input.setsJson}\n` +
      `pricing-items\n${input.itemsJson}\n` +
      `pricing-change-events\n${input.changeEventsJson}\n`,
  );

export const readExactPricingEpochSnapshot = async (
  db: PostgresExecutor,
): Promise<ExactPricingEpochSnapshot> => {
  const services = readPayload(
    await db.execute(sql<SnapshotPayloadRow>`
      select
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', id::text,
              'slug', slug,
              'kind', kind,
              'label', label,
              'isActive', is_active,
              'createdAt', created_at::text,
              'updatedAt', updated_at::text
            ) order by id
          ),
          '[]'::jsonb
        )::text as payload,
        count(*)::integer as row_count
      from pricing_services
    `),
    'pricing_services',
  );
  const sets = readPayload(
    await db.execute(sql<SnapshotPayloadRow>`
      select
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', id::text,
              'serviceId', service_id::text,
              'status', status,
              'currency', currency,
              'effectiveFrom', effective_from::text,
              'effectiveTo', effective_to::text,
              'createdAt', created_at::text,
              'updatedAt', updated_at::text
            ) order by id
          ),
          '[]'::jsonb
        )::text as payload,
        count(*)::integer as row_count
      from pricing_sets
    `),
    'pricing_sets',
  );
  const items = readPayload(
    await db.execute(sql<SnapshotPayloadRow>`
      select
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', id::text,
              'pricingSetId', pricing_set_id::text,
              'code', code,
              'service', service,
              'category', category,
              'name', name,
              'unit', unit,
              'priceCents', price_cents,
              'sortOrder', sort_order,
              'metadata', metadata,
              'createdAt', created_at::text,
              'updatedAt', updated_at::text
            ) order by id
          ),
          '[]'::jsonb
        )::text as payload,
        count(*)::integer as row_count
      from pricing_items
    `),
    'pricing_items',
  );
  const changeEvents = readPayload(
    await db.execute(sql<SnapshotPayloadRow>`
      select
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', id::text,
              'kind', kind,
              'actorId', actor_id,
              'actorKind', actor_kind,
              'actorDisplayName', actor_display_name,
              'serviceSlug', service_slug,
              'reason', reason,
              'oldPricingSetId', old_pricing_set_id::text,
              'newPricingSetId', new_pricing_set_id::text,
              'input', input,
              'createdAt', created_at::text
            ) order by id
          ),
          '[]'::jsonb
        )::text as payload,
        count(*)::integer as row_count
      from pricing_change_events
    `),
    'pricing_change_events',
  );

  assertCompatibleWithCleanPricingConstraints(sets.values, items.values);

  const serialized = Object.freeze({
    servicesJson: services.json,
    setsJson: sets.json,
    itemsJson: items.json,
    changeEventsJson: changeEvents.json,
  });
  return Object.freeze({
    ...serialized,
    rowCounts: Object.freeze({
      services: services.count,
      sets: sets.count,
      items: items.count,
      changeEvents: changeEvents.count,
    }),
    sha256: snapshotSha256(serialized),
  });
};

const assertEmptyTarget = (snapshot: ExactPricingEpochSnapshot): void => {
  if (Object.values(snapshot.rowCounts).every((count) => count === 0)) return;
  fail(
    'pricing_epoch_target_not_empty',
    'The clean-epoch candidate already contains Pricing data.',
    { rowCounts: snapshot.rowCounts },
  );
};

const insertServices = (
  db: PostgresExecutor,
  snapshot: ExactPricingEpochSnapshot,
): Promise<unknown> =>
  db.execute(sql`
    insert into pricing_services (
      id, slug, kind, label, is_active, created_at, updated_at
    )
    select
      (value->>'id')::uuid,
      value->>'slug',
      value->>'kind',
      value->>'label',
      (value->>'isActive')::boolean,
      (value->>'createdAt')::timestamptz,
      (value->>'updatedAt')::timestamptz
    from jsonb_array_elements(${snapshot.servicesJson}::jsonb) as source(value)
  `);

const insertSets = (
  db: PostgresExecutor,
  snapshot: ExactPricingEpochSnapshot,
): Promise<unknown> =>
  db.execute(sql`
    insert into pricing_sets (
      id, service_id, status, currency, effective_from, effective_to,
      created_at, updated_at
    )
    select
      (value->>'id')::uuid,
      (value->>'serviceId')::uuid,
      value->>'status',
      value->>'currency',
      (value->>'effectiveFrom')::timestamptz,
      (value->>'effectiveTo')::timestamptz,
      (value->>'createdAt')::timestamptz,
      (value->>'updatedAt')::timestamptz
    from jsonb_array_elements(${snapshot.setsJson}::jsonb) as source(value)
  `);

const insertItems = (
  db: PostgresExecutor,
  snapshot: ExactPricingEpochSnapshot,
): Promise<unknown> =>
  db.execute(sql`
    insert into pricing_items (
      id, pricing_set_id, code, service, category, name, unit, price_cents,
      sort_order, metadata, created_at, updated_at
    )
    select
      (value->>'id')::uuid,
      (value->>'pricingSetId')::uuid,
      value->>'code',
      value->>'service',
      value->>'category',
      value->>'name',
      value->>'unit',
      (value->>'priceCents')::integer,
      (value->>'sortOrder')::integer,
      value->'metadata',
      (value->>'createdAt')::timestamptz,
      (value->>'updatedAt')::timestamptz
    from jsonb_array_elements(${snapshot.itemsJson}::jsonb) as source(value)
  `);

const insertChangeEvents = (
  db: PostgresExecutor,
  snapshot: ExactPricingEpochSnapshot,
): Promise<unknown> =>
  db.execute(sql`
    insert into pricing_change_events (
      id, kind, actor_id, actor_kind, actor_display_name, service_slug,
      reason, old_pricing_set_id, new_pricing_set_id, input, created_at
    )
    select
      (value->>'id')::uuid,
      value->>'kind',
      value->>'actorId',
      value->>'actorKind',
      value->>'actorDisplayName',
      value->>'serviceSlug',
      value->>'reason',
      (value->>'oldPricingSetId')::uuid,
      (value->>'newPricingSetId')::uuid,
      value->'input',
      (value->>'createdAt')::timestamptz
    from jsonb_array_elements(${snapshot.changeEventsJson}::jsonb) as source(value)
  `);

export const transferExactPricingEpoch = async (input: {
  readonly target: PostgresDatabase;
  readonly sourceSnapshot: ExactPricingEpochSnapshot;
}): Promise<ExactPricingEpochSnapshot> => {
  try {
    return await input.target.transaction(async (transaction) => {
      assertEmptyTarget(await readExactPricingEpochSnapshot(transaction));

      await insertServices(transaction, input.sourceSnapshot);
      await insertSets(transaction, input.sourceSnapshot);
      await insertItems(transaction, input.sourceSnapshot);
      await insertChangeEvents(transaction, input.sourceSnapshot);

      const candidateSnapshot =
        await readExactPricingEpochSnapshot(transaction);
      if (candidateSnapshot.sha256 !== input.sourceSnapshot.sha256)
        fail(
          'pricing_epoch_digest_mismatch',
          'The candidate Pricing digest differs from the legacy Pricing digest.',
          {
            actual: candidateSnapshot.sha256,
            expected: input.sourceSnapshot.sha256,
          },
        );
      return candidateSnapshot;
    });
  } catch (cause) {
    if (isAppError(cause)) throw cause;
    return fail(
      'pricing_epoch_transfer_failed',
      'The exact Pricing transfer failed and was rolled back.',
      undefined,
      cause,
    );
  }
};
