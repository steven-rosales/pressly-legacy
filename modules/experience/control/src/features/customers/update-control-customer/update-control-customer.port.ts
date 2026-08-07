import type { Result } from '@pressly/kernel';
import type { ControlCommandContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlCustomerRejection } from '../../../foundations/language/control-customer/control-customer.failure.ts';
import type { ControlCustomerMutation } from '../../../foundations/language/control-customer/control-customer.model.ts';
import type { ControlCustomerProfile } from '../../../foundations/language/control-customer/control-customer.value.ts';

export type UpdateControlCustomerPort = (input: {
  businessId: string;
  userId: string;
  idempotencyKey: string;
  expectedVersion: number;
  context: ControlCommandContext;
  changes: Partial<ControlCustomerProfile> & Readonly<{ active?: boolean }>;
}) => Promise<Result<ControlCustomerMutation, ControlCustomerRejection>>;
