import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlOrderFailure } from '../../../foundations/language/control-order/control-order.failure.ts';
import type { ControlOrderDetail } from '../../../foundations/language/control-order/control-order.model.ts';
import { resolveControlLocationIds } from '../../../foundations/language/control-order/control-order.policy.ts';
import { toControlOrderDetail } from '../../../foundations/language/control-order/control-order.projection.ts';
import type { ControlOrderReader } from '../../../foundations/ports/control-order-reader/control-order-reader.port.ts';

export type GetControlOrder = (input: {
  context: ControlRequestContext;
  orderId: string;
}) => Promise<Result<ControlOrderDetail, ControlOrderFailure>>;

export const makeGetControlOrder =
  (getOrder: ControlOrderReader): GetControlOrder =>
  async ({ context, orderId }) => {
    const locations = resolveControlLocationIds(context.access);
    if (result.isErr(locations)) return locations;

    const order = await getOrder({
      businessId: context.access.business.id,
      locationIds: locations.value,
      orderId,
    });
    return result.isErr(order)
      ? order
      : result.ok(toControlOrderDetail(order.value));
  };
