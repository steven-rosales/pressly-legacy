import {
  productionIdSchema,
  type ProductionOrderListItem,
} from '@pressly/contracts';

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

const mapOrderStatus = (value: string): ProductionOrderListItem['status'] => {
  switch (value) {
    case 'intake_pending':
    case 'eligible':
    case 'ineligible':
    case 'scheduled':
    case 'finished':
      return value;
    default:
      throw new Error(`Unknown production order status: ${value}.`);
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
  throw new Error(`Unknown bag-count provenance: ${value}.`);
};

export const productionDueBucket = (
  dueAt: Date,
  now: Date,
): ProductionOrderListItem['dueBucket'] => {
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const due = Date.UTC(
    dueAt.getUTCFullYear(),
    dueAt.getUTCMonth(),
    dueAt.getUTCDate(),
  );
  const distance = Math.floor((due - start) / 86_400_000);
  return distance <= 0 ? 'today' : distance === 1 ? 'tomorrow' : 'later';
};

export const mapProductionOrderListItem = (
  row: ProductionOrderListRow,
  now: Date,
): ProductionOrderListItem => {
  const status = mapOrderStatus(row.status);
  const bagCountProvenance = mapBagCountProvenance(row.bagCountSource);

  if ((row.bagCount === null) !== (bagCountProvenance === null))
    throw new Error('Bag count and provenance disagree in persistence.');
  if (row.bagCount === null && row.intakeVersion !== 0)
    throw new Error('Missing bag intake must have persistence version zero.');
  if (row.bagCount !== null && row.intakeVersion <= 0)
    throw new Error('Recorded bag intake requires a positive version.');
  if (status === 'intake_pending' && row.bagCount !== null)
    throw new Error('An intake-pending order already has bag intake.');
  if (status !== 'intake_pending' && row.bagCount === null)
    throw new Error('A non-pending order is missing bag intake.');

  return {
    id: row.id,
    locationId: row.locationId,
    externalOrderId: row.externalOrderId,
    dueAt: row.dueAt.toISOString(),
    dueBucket: productionDueBucket(row.dueAt, now),
    priority: row.priority,
    status,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    bagCountProvenance,
    intakeVersion: row.bagCount === null ? null : row.intakeVersion,
    version: row.version,
  };
};

export const encodeProductionOrderCursor = (orderId: string): string => {
  productionIdSchema.parse(orderId);
  return Buffer.from(orderId, 'utf8').toString('base64url');
};

export const decodeProductionOrderCursor = (cursor: string): string | null => {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return productionIdSchema.safeParse(decoded).success ? decoded : null;
  } catch {
    return null;
  }
};
