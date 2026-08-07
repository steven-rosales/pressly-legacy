import type { Result } from '@pressly/kernel';
import type { ControlCustomerRejection } from '../../../foundations/language/control-customer/control-customer.failure.ts';
import type { ControlCustomerSnapshot } from '../../../foundations/language/control-customer/control-customer.model.ts';

export type GetControlCustomerPort = (input: {
  businessId: string;
  userId: string;
}) => Promise<Result<ControlCustomerSnapshot, ControlCustomerRejection>>;
