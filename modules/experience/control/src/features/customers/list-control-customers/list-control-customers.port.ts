import type { Result } from '@pressly/kernel';
import type { ControlCustomerRejection } from '../../../foundations/language/control-customer/control-customer.failure.ts';
import type { ControlCustomerSnapshot } from '../../../foundations/language/control-customer/control-customer.model.ts';

export type ListControlCustomersPort = (input: {
  businessId: string;
  query: string | null;
  active: boolean | null;
  limit: number;
  cursor: string | null;
}) => Promise<
  Result<
    Readonly<{
      items: readonly ControlCustomerSnapshot[];
      nextCursor: string | null;
    }>,
    ControlCustomerRejection
  >
>;
