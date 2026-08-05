import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlCustomerRejection } from '../../../foundations/language/control-customer/control-customer.failure.ts';
import type { ControlCustomer } from '../../../foundations/language/control-customer/control-customer.model.ts';
import { toControlCustomer } from '../../../foundations/language/control-customer/control-customer.projection.ts';
import type { GetControlCustomerPort } from './get-control-customer.port.ts';

export type GetControlCustomer = (input: {
  context: ControlRequestContext;
  userId: string;
}) => Promise<Result<ControlCustomer, ControlCustomerRejection>>;

export const makeGetControlCustomer =
  (getCustomer: GetControlCustomerPort): GetControlCustomer =>
  async ({ context, userId }) => {
    const customer = await getCustomer({
      businessId: context.access.business.id,
      userId,
    });
    return result.isErr(customer)
      ? customer
      : result.ok(toControlCustomer(customer.value));
  };
