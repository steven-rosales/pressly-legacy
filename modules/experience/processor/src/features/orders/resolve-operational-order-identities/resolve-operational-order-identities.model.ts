export type ProductionOrderIdentitySource = Readonly<{
  id: string;
  externalOrderId: string;
}>;

export type ProductionBoardIdentitySource = Readonly<{
  batches: readonly Readonly<{
    orders: readonly ProductionOrderIdentitySource[];
  }>[];
}>;

export type ProductionWorkspaceIdentitySource = Readonly<{
  orders: readonly ProductionOrderIdentitySource[];
  pendingEligibleOrders: readonly ProductionOrderIdentitySource[];
  liveRunChanges: Readonly<{
    orders: readonly ProductionOrderIdentitySource[];
  }> | null;
  board: ProductionBoardIdentitySource | null;
}>;

export type ProductionForecastIdentitySource = Readonly<{
  groups: Readonly<{
    inProduction: readonly ForecastOrderIdentitySource[];
    readyToPlace: readonly ForecastOrderIdentitySource[];
    expectedLater: readonly ForecastOrderIdentitySource[];
    needsShift: readonly ForecastOrderIdentitySource[];
  }>;
}>;

export type ForecastOrderIdentitySource = Readonly<{
  productionOrderId: string | null;
  orderDemandId: string;
  externalOrderId: string;
}>;

export type ProductionHistoryRunIdentitySource = Readonly<{
  orderMemberships: readonly Readonly<{
    productionOrderId: string;
    externalOrderId: string;
  }>[];
}>;

export type ProductionBacklogIdentitySource = Readonly<{
  groups: Readonly<{
    readyToArchive: readonly BacklogOrderIdentitySource[];
    reviewIndividually: readonly BacklogOrderIdentitySource[];
    keptForSafety: readonly BacklogOrderIdentitySource[];
    alreadyHistorical: readonly BacklogOrderIdentitySource[];
  }>;
}>;

export type BacklogOrderIdentitySource = Readonly<{
  orderId: string;
  displayReference: string;
}>;

export type ProductionHistoryActivityIdentitySource = Readonly<{
  items: readonly Readonly<{
    entityType: string;
    entityId: string;
  }>[];
}>;
