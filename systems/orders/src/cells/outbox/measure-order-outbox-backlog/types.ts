export const measureOrderOutboxBacklogOperationId =
  'orders.measure-order-outbox-backlog.v1' as const;

export type MeasureOrderOutboxBacklogInput = Readonly<Record<string, never>>;

export type MeasureOrderOutboxBacklogExpectedFailure = never;

export type StoredOrderOutboxBacklog = Readonly<{
  pendingCount: number;
  oldestPendingAt: Date | null;
}>;

export type MeasureOrderOutboxBacklogRepository = Readonly<{
  measure: () => Promise<StoredOrderOutboxBacklog>;
}>;

export type MeasureOrderOutboxBacklogClock = Readonly<{ now: () => Date }>;
