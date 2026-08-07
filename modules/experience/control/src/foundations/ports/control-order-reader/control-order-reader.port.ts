import type { Result } from '@pressly/kernel';
import type { ControlOrderRejection } from '../../language/control-order/control-order.failure.ts';
import type { ControlOrderDetailSnapshot } from '../../language/control-order/control-order.model.ts';

export type ControlOrderReader = (input: {
  businessId: string;
  locationIds: readonly string[];
  orderId: string;
}) => Promise<Result<ControlOrderDetailSnapshot, ControlOrderRejection>>;
