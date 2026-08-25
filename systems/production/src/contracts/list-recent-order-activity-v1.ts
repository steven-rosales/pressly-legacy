export const listRecentProductionOrderActivityV1CapabilityContract =
  Object.freeze({
    id: 'production.list-recent-order-activity.v1',
    version: 1,
    maximumPerOrder: 8,
  } as const);

export type RecentProductionOrderActivityV1 = Readonly<{
  productionOrderId: string;
  code: string;
  actorId: string;
  occurredAt: Date;
}>;

export type ListRecentProductionOrderActivityV1Capability = Readonly<{
  contract: typeof listRecentProductionOrderActivityV1CapabilityContract;
  list: (input: {
    productionOrderIds: readonly string[];
  }) => Promise<readonly RecentProductionOrderActivityV1[]>;
}>;
