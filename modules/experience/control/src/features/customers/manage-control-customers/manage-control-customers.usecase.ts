import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type {
  ControlCustomer,
  ControlCustomerList,
  ControlCustomerMutation,
} from '../../../foundations/language/control-customer/control-customer.model.ts';
import type { ControlCustomerProfile } from '../../../foundations/language/control-customer/control-customer.value.ts';
import type {
  ControlCustomerRejection,
  ControlCustomersPort,
} from '../../../foundations/ports/control-customers/control-customers.port.ts';
import { toControlCustomer } from './control-customer.projection.mapper.ts';

type CustomerResult<Value> = Promise<Result<Value, ControlCustomerRejection>>;

export type ControlCustomersApplication = Readonly<{
  list: (input: {
    context: ControlRequestContext;
    query?: string;
    active?: boolean;
    cursor?: string;
    limit: number;
  }) => CustomerResult<ControlCustomerList>;
  get: (input: {
    context: ControlRequestContext;
    userId: string;
  }) => CustomerResult<ControlCustomer>;
  create: (input: {
    context: ControlRequestContext;
    idempotencyKey: string;
    profile: ControlCustomerProfile;
  }) => CustomerResult<ControlCustomerMutation>;
  update: (input: {
    context: ControlRequestContext;
    userId: string;
    idempotencyKey: string;
    expectedVersion: number;
    changes: Partial<ControlCustomerProfile> & Readonly<{ active?: boolean }>;
  }) => CustomerResult<ControlCustomerMutation>;
}>;

export const makeControlCustomersApplication = (
  customers: ControlCustomersPort,
): ControlCustomersApplication => ({
  list: async ({ context, ...query }) => {
    const page = await customers.list({
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
  },
  get: async ({ context, userId }) => {
    const customer = await customers.get({
      businessId: context.access.business.id,
      userId,
    });
    return result.isErr(customer)
      ? customer
      : result.ok(toControlCustomer(customer.value));
  },
  create: async ({ context, ...command }) => {
    const created = await customers.create({
      ...command,
      businessId: context.access.business.id,
      context: context.command,
    });
    return created;
  },
  update: async ({ context, ...command }) => {
    const updated = await customers.update({
      ...command,
      businessId: context.access.business.id,
      context: context.command,
    });
    return updated;
  },
});
