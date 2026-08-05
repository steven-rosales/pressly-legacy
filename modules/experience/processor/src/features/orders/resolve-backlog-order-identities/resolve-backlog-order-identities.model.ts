export type BacklogOrderIdentitySource = Readonly<{
  orderId: string;
  displayReference: string;
}>;

export type ProductionBacklogIdentitySource = Readonly<{
  groups: Readonly<{
    readyToArchive: readonly BacklogOrderIdentitySource[];
    reviewIndividually: readonly BacklogOrderIdentitySource[];
    keptForSafety: readonly BacklogOrderIdentitySource[];
    alreadyHistorical: readonly BacklogOrderIdentitySource[];
  }>;
}>;
