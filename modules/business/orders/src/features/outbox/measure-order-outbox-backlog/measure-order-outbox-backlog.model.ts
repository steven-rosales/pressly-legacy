export type OrderOutboxBacklog = Readonly<{
  pendingCount: number;
  oldestPendingAgeSeconds: number;
}>;
