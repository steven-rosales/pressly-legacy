import type { ProductionOrderListItem } from '@pressly/contracts';
import { invariantViolationError } from '@pressly/errors';
import {
  productionDueBucket,
  productionDueFilter,
} from './production-due-bucket.policy.ts';

export { productionDueBucket, productionDueFilter };

export type ProductionOrderListRow = Readonly<{
  id: string;
  locationId: string;
  externalOrderId: string;
  dueAt: Date;
  priority: boolean;
  status: string;
  derivedWeightLbs: number;
  bagCount: number | null;
  bagCountSource: string | null;
  intakeVersion: number;
  version: number;
}>;

const storedProductionInvariant = (
  code: string,
  message: string,
  details?: unknown,
) =>
  invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored production order data is inconsistent.',
    ...(details === undefined ? {} : { details }),
  });

const mapOrderStatus = (value: string): ProductionOrderListItem['status'] => {
  switch (value) {
    case 'release_pending':
    case 'intake_pending':
    case 'eligible':
    case 'ineligible':
    case 'scheduled':
    case 'finished':
      return value;
    default:
      throw storedProductionInvariant(
        'PRODUCTION_ORDER_STATUS_INVALID',
        `Unknown production order status: ${value}.`,
        { status: value },
      );
  }
};

const mapBagCountProvenance = (
  value: string | null,
): ProductionOrderListItem['bagCountProvenance'] => {
  if (
    value === null ||
    value === 'external_source' ||
    value === 'operator_intake'
  )
    return value;
  throw storedProductionInvariant(
    'PRODUCTION_BAG_COUNT_PROVENANCE_INVALID',
    `Unknown bag-count provenance: ${value}.`,
    { provenance: value },
  );
};

export const mapProductionOrderListItem = (
  row: ProductionOrderListRow,
  now: Date,
  timezone: string,
): ProductionOrderListItem => {
  const status = mapOrderStatus(row.status);
  const bagCountProvenance = mapBagCountProvenance(row.bagCountSource);

  if ((row.bagCount === null) !== (bagCountProvenance === null))
    throw storedProductionInvariant(
      'PRODUCTION_BAG_COUNT_STATE_INVALID',
      'Bag count and provenance disagree in persistence.',
      { bagCount: row.bagCount, bagCountProvenance },
    );
  if (row.bagCount === null && row.intakeVersion !== 0)
    throw storedProductionInvariant(
      'PRODUCTION_BAG_INTAKE_VERSION_INVALID',
      'Missing bag intake must have persistence version zero.',
      { bagCount: row.bagCount, intakeVersion: row.intakeVersion },
    );
  if (row.bagCount !== null && row.intakeVersion <= 0)
    throw storedProductionInvariant(
      'PRODUCTION_BAG_INTAKE_VERSION_INVALID',
      'Recorded bag intake requires a positive version.',
      { bagCount: row.bagCount, intakeVersion: row.intakeVersion },
    );
  if (status === 'intake_pending' && row.bagCount !== null)
    throw storedProductionInvariant(
      'PRODUCTION_BAG_INTAKE_STATE_INVALID',
      'An intake-pending order already has bag intake.',
      { status, bagCount: row.bagCount },
    );
  if (
    status !== 'release_pending' &&
    status !== 'intake_pending' &&
    status !== 'ineligible' &&
    row.bagCount === null
  )
    throw storedProductionInvariant(
      'PRODUCTION_BAG_INTAKE_STATE_INVALID',
      'A non-pending order is missing bag intake.',
      { status, bagCount: row.bagCount },
    );

  return {
    id: row.id,
    locationId: row.locationId,
    externalOrderId: row.externalOrderId,
    dueAt: row.dueAt.toISOString(),
    dueBucket: productionDueBucket(row.dueAt, now, timezone),
    priority: row.priority,
    status,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    bagCountProvenance,
    intakeVersion: row.bagCount === null ? null : row.intakeVersion,
    version: row.version,
  };
};
