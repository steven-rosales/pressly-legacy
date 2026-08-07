export type ProductionHistoryRunIdentitySource = Readonly<{
  orderMemberships: readonly Readonly<{
    productionOrderId: string;
    externalOrderId: string;
  }>[];
}>;
