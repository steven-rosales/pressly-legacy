import type { Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlCustomerRejection } from '../../../foundations/language/control-customer/control-customer.failure.ts';
import type { ControlCustomerMutation } from '../../../foundations/language/control-customer/control-customer.model.ts';
import type { ControlCustomerProfile } from '../../../foundations/language/control-customer/control-customer.value.ts';
import type { CreateControlCustomerPort } from './create-control-customer.port.ts';

export type CreateControlCustomer = (input: {
  context: ControlRequestContext;
  idempotencyKey: string;
  profile: ControlCustomerProfile;
}) => Promise<Result<ControlCustomerMutation, ControlCustomerRejection>>;

export const makeCreateControlCustomer =
  (createCustomer: CreateControlCustomerPort): CreateControlCustomer =>
  ({ context, ...command }) =>
    createCustomer({
      ...command,
      businessId: context.access.business.id,
      context: context.command,
    });
