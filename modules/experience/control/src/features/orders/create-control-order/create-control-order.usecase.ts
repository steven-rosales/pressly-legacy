import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlOrderFailure } from '../../../foundations/language/control-order/control-order.failure.ts';
import type { ControlOrderMutation } from '../../../foundations/language/control-order/control-order.model.ts';
import {
  resolveControlLocationIds,
  toControlOrderCustomerReference,
} from '../../../foundations/language/control-order/control-order.policy.ts';
import type {
  ControlDirectCustomerInput,
  ControlOrderFulfillmentInput,
  ControlOrderItem,
} from '../../../foundations/language/control-order/control-order.value.ts';
import type { CreateControlOrderPort } from './create-control-order.port.ts';

export type CreateControlOrder = (input: {
  context: ControlRequestContext;
  idempotencyKey: string;
  reasonCode: 'new_customer_order' | 'recovery_entry';
  reasonNote: string | null;
  customer: ControlDirectCustomerInput;
  displayNumber: string | null;
  dueAt: string;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
  items: readonly ControlOrderItem[];
  fulfillment: ControlOrderFulfillmentInput;
}) => Promise<Result<ControlOrderMutation, ControlOrderFailure>>;

export const makeCreateControlOrder =
  (createOrder: CreateControlOrderPort): CreateControlOrder =>
  async ({ context, ...command }) => {
    const locations = resolveControlLocationIds(
      context.access,
      command.fulfillment.locationId,
    );
    if (result.isErr(locations)) return locations;

    return createOrder({
      ...command,
      businessId: context.access.business.id,
      context: context.command,
      customer: toControlOrderCustomerReference(command.customer),
      dueAt: new Date(command.dueAt),
    });
  };
