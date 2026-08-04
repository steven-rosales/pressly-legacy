import type {
  OperationalOrderAuditEntry,
  OperationalOrderIdentityReference,
} from './operational-order.model.ts';

const cleanNamePart = (value: string | null): string | null => {
  const normalized = value?.trim().replace(/\s+/g, ' ') ?? '';
  return normalized.length === 0 ? null : normalized;
};

export const canonicalCustomerDisplayName = (input: {
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
}): string | null => {
  const businessName = cleanNamePart(input.businessName);
  if (businessName !== null) return businessName;
  const personalName = [input.firstName, input.lastName]
    .map(cleanNamePart)
    .filter((part): part is string => part !== null)
    .join(' ');
  return personalName.length === 0 ? null : personalName;
};

export const productionOrderReferenceId = (productionOrderId: string): string =>
  `production:${productionOrderId}`;

export const orderDemandReferenceId = (orderDemandId: string): string =>
  `demand:${orderDemandId}`;

export const uniqueOperationalOrderReferences = (
  references: readonly OperationalOrderIdentityReference[],
): readonly OperationalOrderIdentityReference[] => [
  ...new Map(
    references.map((reference) => [reference.referenceId, reference]),
  ).values(),
];

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
