import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlOrderFailure } from '../../../foundations/language/control-order/control-order.failure.ts';
import type { ControlOrderList } from '../../../foundations/language/control-order/control-order.model.ts';
import { resolveControlLocationIds } from '../../../foundations/language/control-order/control-order.policy.ts';
import { toControlOrder } from '../../../foundations/language/control-order/control-order.projection.ts';
import type { ControlOrderState } from '../../../foundations/language/control-order/control-order.value.ts';
import type { ListControlOrdersPort } from './list-control-orders.port.ts';

export type ListControlOrders = (input: {
  context: ControlRequestContext;
  query?: string;
  state?: ControlOrderState;
  locationId?: string;
  cursor?: string;
  limit: number;
}) => Promise<Result<ControlOrderList, ControlOrderFailure>>;

export const makeListControlOrders =
  (listOrders: ListControlOrdersPort): ListControlOrders =>
  async ({ context, ...query }) => {
    const locations = resolveControlLocationIds(
      context.access,
      query.locationId,
    );
    if (result.isErr(locations)) return locations;

    const page = await listOrders({
      businessId: context.access.business.id,
      locationIds: locations.value,
      query: query.query ?? null,
      state: query.state ?? null,
      limit: query.limit,
      cursor: query.cursor ?? null,
    });
    return result.isErr(page)
      ? page
      : result.ok({
          items: page.value.items.map(toControlOrder),
          nextCursor: page.value.nextCursor,
        });
  };
