export const listRecentOrderAuditV1CapabilityContract = Object.freeze({
  id: 'orders.list-recent-order-audit.v1',
  version: 1,
  perOrderLimit: 8,
} as const);

export type RecentOrderAuditV1 = Readonly<{
  sources: readonly Readonly<{
    canonicalOrderId: string;
    name: string;
    observedAt: Date;
  }>[];
  commands: readonly Readonly<{
    canonicalOrderId: string;
    code: string;
    actorId: string;
    occurredAt: Date;
  }>[];
}>;

/**
 * Lists the newest eight source observations and Order commands per supplied
 * canonical Order. Production work-event audit remains Production-owned.
 */
export type ListRecentOrderAuditV1Capability = Readonly<{
  contract: typeof listRecentOrderAuditV1CapabilityContract;
  execute: (
    input: Readonly<{
      canonicalOrderIds: readonly string[];
    }>,
  ) => Promise<RecentOrderAuditV1>;
}>;
