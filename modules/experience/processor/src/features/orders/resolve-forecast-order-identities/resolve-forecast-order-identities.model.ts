export type ForecastOrderIdentitySource = Readonly<{
  productionOrderId: string | null;
  orderDemandId: string;
  externalOrderId: string;
}>;

export type ProductionForecastIdentitySource = Readonly<{
  groups: Readonly<{
    inProduction: readonly ForecastOrderIdentitySource[];
    readyToPlace: readonly ForecastOrderIdentitySource[];
    expectedLater: readonly ForecastOrderIdentitySource[];
    needsShift: readonly ForecastOrderIdentitySource[];
  }>;
}>;
