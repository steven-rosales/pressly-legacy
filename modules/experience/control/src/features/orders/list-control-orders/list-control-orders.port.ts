import type { Result } from '@pressly/kernel';
import type { ControlOrderRejection } from '../../../foundations/language/control-order/control-order.failure.ts';
import type { ControlOrderSnapshot } from '../../../foundations/language/control-order/control-order.model.ts';
import type { ControlOrderState } from '../../../foundations/language/control-order/control-order.value.ts';

export type ListControlOrdersPort = (input: {
  businessId: string;
  locationIds: readonly string[];
  query: string | null;
  state: ControlOrderState | null;
  limit: number;
  cursor: string | null;
}) => Promise<
  Result<
    Readonly<{
      items: readonly ControlOrderSnapshot[];
      nextCursor: string | null;
    }>,
    ControlOrderRejection
  >
>;
