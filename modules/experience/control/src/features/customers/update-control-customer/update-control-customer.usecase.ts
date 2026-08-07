import type { Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlCustomerRejection } from '../../../foundations/language/control-customer/control-customer.failure.ts';
import type { ControlCustomerMutation } from '../../../foundations/language/control-customer/control-customer.model.ts';
import type { ControlCustomerProfile } from '../../../foundations/language/control-customer/control-customer.value.ts';
import type { UpdateControlCustomerPort } from './update-control-customer.port.ts';

export type UpdateControlCustomer = (input: {
  context: ControlRequestContext;
  userId: string;
  idempotencyKey: string;
  expectedVersion: number;
  changes: Partial<ControlCustomerProfile> & Readonly<{ active?: boolean }>;
}) => Promise<Result<ControlCustomerMutation, ControlCustomerRejection>>;

export const makeUpdateControlCustomer =
  (updateCustomer: UpdateControlCustomerPort): UpdateControlCustomer =>
  ({ context, ...command }) =>
    updateCustomer({
      ...command,
      businessId: context.access.business.id,
      context: context.command,
    });
