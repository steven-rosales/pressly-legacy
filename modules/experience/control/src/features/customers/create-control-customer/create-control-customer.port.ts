import type { Result } from '@pressly/kernel';
import type { ControlCommandContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlCustomerRejection } from '../../../foundations/language/control-customer/control-customer.failure.ts';
import type { ControlCustomerMutation } from '../../../foundations/language/control-customer/control-customer.model.ts';
import type { ControlCustomerProfile } from '../../../foundations/language/control-customer/control-customer.value.ts';

export type CreateControlCustomerPort = (input: {
  businessId: string;
  idempotencyKey: string;
  context: ControlCommandContext;
  profile: ControlCustomerProfile;
}) => Promise<Result<ControlCustomerMutation, ControlCustomerRejection>>;
