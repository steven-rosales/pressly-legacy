import type { OrderOutboxBacklog } from './measure-order-outbox-backlog.model.ts';

export type MeasureOrderOutboxBacklog = () => Promise<OrderOutboxBacklog>;

export type MeasureOrderOutboxBacklogRepository = () => Promise<
  Readonly<{
    pendingCount: number;
    oldestPendingAt: Date | null;
  }>
>;
