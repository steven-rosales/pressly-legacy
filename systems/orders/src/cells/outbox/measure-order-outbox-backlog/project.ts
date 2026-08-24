import type { OrderOutboxBacklog } from '../../../model/order-outbox/model.ts';
import type { StoredOrderOutboxBacklog } from './types.ts';

export const projectOrderOutboxBacklog = (input: {
  stored: StoredOrderOutboxBacklog;
  now: Date;
}): OrderOutboxBacklog => ({
  pendingCount: input.stored.pendingCount,
  oldestPendingAgeSeconds:
    input.stored.oldestPendingAt === null
      ? 0
      : Math.max(
          0,
          (input.now.getTime() - input.stored.oldestPendingAt.getTime()) /
            1_000,
        ),
});
