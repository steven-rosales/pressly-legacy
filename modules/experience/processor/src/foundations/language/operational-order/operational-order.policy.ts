import type {
  OperationalOrderAuditEntry,
  OperationalOrderIdentity,
  OperationalOrderIdentityReference,
  OperationalOrderIdentityResolution,
  ProductionOrderIdentitySource,
} from './operational-order.model.ts';
import { productionOrderReferenceId } from './operational-order.value.ts';

export const uniqueOperationalOrderReferences = (
  references: readonly OperationalOrderIdentityReference[],
): readonly OperationalOrderIdentityReference[] => [
  ...new Map(
    references.map((reference) => [reference.referenceId, reference]),
  ).values(),
];

export const productionOrderIdentityReference = (
  order: ProductionOrderIdentitySource,
): OperationalOrderIdentityReference => ({
  referenceId: productionOrderReferenceId(order.id),
  productionOrderId: order.id,
  orderDemandId: null,
  fallbackDisplayNumber: order.externalOrderId,
});

export const operationalOrderIdentityValues = (
  resolutions: ReadonlyMap<string, OperationalOrderIdentityResolution>,
): ReadonlyMap<string, OperationalOrderIdentity> =>
  new Map(
    [...resolutions.entries()].map(([referenceId, value]) => [
      referenceId,
      value.identity,
    ]),
  );

const auditSort = (
  left: OperationalOrderAuditEntry,
  right: OperationalOrderAuditEntry,
): number => {
  const occurredAt = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
  if (occurredAt !== 0) return occurredAt;
  return [left.kind, left.code, left.actor, left.outcome ?? '']
    .join('\u0000')
    .localeCompare(
      [right.kind, right.code, right.actor, right.outcome ?? ''].join('\u0000'),
    );
};

export const recentOperationalOrderAudit = (
  ...groups: readonly (readonly OperationalOrderAuditEntry[])[]
): readonly OperationalOrderAuditEntry[] =>
  groups.flat().sort(auditSort).slice(0, 8);
