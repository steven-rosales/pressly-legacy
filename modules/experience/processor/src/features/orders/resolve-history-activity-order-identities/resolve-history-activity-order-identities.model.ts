export type ProductionHistoryActivityIdentitySource = Readonly<{
  items: readonly Readonly<{
    entityType: string;
    entityId: string;
  }>[];
}>;
