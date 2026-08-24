import type { ListProductionOrdersResult } from './boundary.ts';
import {
  configError,
  invariantViolationError,
} from '@pressly/errors/factories';
import type {
  ProductionBagCountProvenance,
  ProductionOrder,
  ProductionOrderDueBucket,
  ProductionOrderPersistenceRow,
  ProductionOrderStatus,
  ProductionOrdersPage,
} from './types.ts';

const invariant = (code: string, message: string, details?: unknown) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Stored production order data is inconsistent.',
    ...(details === undefined ? {} : { details }),
  });

const orderStatus = (value: string): ProductionOrderStatus => {
  switch (value) {
    case 'release_pending':
    case 'intake_pending':
    case 'eligible':
    case 'ineligible':
    case 'scheduled':
    case 'finished':
      return value;
    default:
      throw invariant(
        'production_order_status_invalid',
        `Unknown production order status: ${value}.`,
        {
          status: value,
        },
      );
  }
};

const provenance = (
  value: string | null,
): ProductionBagCountProvenance | null => {
  if (
    value === null ||
    value === 'external_source' ||
    value === 'operator_intake'
  )
    return value;
  throw invariant(
    'production_bag_count_provenance_invalid',
    `Unknown bag-count provenance: ${value}.`,
    { provenance: value },
  );
};

const localDay = (instant: Date, timezone: string): number => {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
  } catch (cause) {
    throw configError({
      code: 'production_timezone_invalid',
      message: `Cannot calculate a local production day in ${timezone}.`,
      safeMessage: 'Production configuration is invalid.',
      cause,
    });
  }
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(value('year'), value('month') - 1, value('day')) / 86_400_000;
};

export const productionDueBucket = (
  dueAt: Date,
  asOf: Date,
  timezone: string,
): ProductionOrderDueBucket => {
  const distance = localDay(dueAt, timezone) - localDay(asOf, timezone);
  if (distance < 0) return 'overdue';
  if (distance === 0) return 'today';
  if (distance === 1) return 'tomorrow';
  return 'later';
};

export const projectProductionOrder = (
  row: ProductionOrderPersistenceRow,
  asOf: Date,
  timezone: string,
): ProductionOrder => {
  const status = orderStatus(row.status);
  const bagCountProvenance = provenance(row.bagCountSource);
  if ((row.bagCount === null) !== (bagCountProvenance === null))
    throw invariant(
      'production_bag_count_state_invalid',
      'Bag count and provenance disagree in persistence.',
      { bagCount: row.bagCount, bagCountProvenance },
    );
  if (row.bagCount === null && row.intakeVersion !== 0)
    throw invariant(
      'production_bag_intake_version_invalid',
      'Missing bag intake must have persistence version zero.',
      { bagCount: row.bagCount, intakeVersion: row.intakeVersion },
    );
  if (row.bagCount !== null && row.intakeVersion <= 0)
    throw invariant(
      'production_bag_intake_version_invalid',
      'Recorded bag intake requires a positive version.',
      { bagCount: row.bagCount, intakeVersion: row.intakeVersion },
    );
  if (status === 'intake_pending' && row.bagCount !== null)
    throw invariant(
      'production_bag_intake_state_invalid',
      'An intake-pending order already has bag intake.',
      { status, bagCount: row.bagCount },
    );
  if (
    status !== 'release_pending' &&
    status !== 'intake_pending' &&
    status !== 'ineligible' &&
    row.bagCount === null
  )
    throw invariant(
      'production_bag_intake_state_invalid',
      'A non-pending order is missing bag intake.',
      { status, bagCount: row.bagCount },
    );

  return {
    id: row.id,
    locationId: row.locationId,
    externalOrderId: row.externalOrderId,
    dueAt: row.dueAt,
    dueBucket: productionDueBucket(row.dueAt, asOf, timezone),
    priority: row.priority,
    status,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    bagCountProvenance,
    intakeVersion: row.bagCount === null ? null : row.intakeVersion,
    version: row.version,
  };
};

export const projectOrdersResult = (
  page: ProductionOrdersPage,
): ListProductionOrdersResult => ({
  items: page.items.map((order) => ({
    ...order,
    dueAt: order.dueAt.toISOString(),
  })),
  nextCursor: page.nextCursor,
  asOf: page.asOf.toISOString(),
});
