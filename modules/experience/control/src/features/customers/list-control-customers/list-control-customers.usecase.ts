import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlCustomerRejection } from '../../../foundations/language/control-customer/control-customer.failure.ts';
import type { ControlCustomerList } from '../../../foundations/language/control-customer/control-customer.model.ts';
import { toControlCustomer } from '../../../foundations/language/control-customer/control-customer.projection.ts';
import type { ListControlCustomersPort } from './list-control-customers.port.ts';

export type ListControlCustomers = (input: {
  context: ControlRequestContext;
  query?: string;
  active?: boolean;
  cursor?: string;
  limit: number;
}) => Promise<Result<ControlCustomerList, ControlCustomerRejection>>;

export const makeListControlCustomers =
  (listCustomers: ListControlCustomersPort): ListControlCustomers =>
  async ({ context, ...query }) => {
    const page = await listCustomers({
      businessId: context.access.business.id,
      query: query.query ?? null,
      active: query.active ?? null,
      limit: query.limit,
      cursor: query.cursor ?? null,
    });
    return result.isErr(page)
      ? page
      : result.ok({
          items: page.value.items.map(toControlCustomer),
          nextCursor: page.value.nextCursor,
        });
  };
