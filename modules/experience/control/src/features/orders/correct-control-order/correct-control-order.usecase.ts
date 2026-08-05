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
  ControlOrderItem,
} from '../../../foundations/language/control-order/control-order.value.ts';
import type { ControlOrderReader } from '../../../foundations/ports/control-order-reader/control-order-reader.port.ts';
import type { CorrectControlOrderPort } from './correct-control-order.port.ts';

export type CorrectControlOrder = (input: {
  context: ControlRequestContext;
  orderId: string;
  idempotencyKey: string;
  reasonCode:
    | 'customer_correction'
    | 'manager_correction'
    | 'source_discrepancy';
  reasonNote: string | null;
  expectedOrderVersion: number;
  expectedFulfillmentVersion: number;
  changes: Readonly<{
    customer?: ControlDirectCustomerInput;
    displayNumber?: string | null;
    dueAt?: string;
    currency?: string;
    totalAmountCents?: number;
    balanceDueCents?: number | null;
    items?: readonly ControlOrderItem[];
    fulfillment?: Readonly<{
      typeCode?: string;
      locationId?: string;
      estimatedWeight?: Readonly<{
        lbs: number | null;
        source: string | null;
      }>;
    }>;
  }>;
}) => Promise<Result<ControlOrderMutation, ControlOrderFailure>>;

export const makeCorrectControlOrder =
  (deps: {
    getOrder: ControlOrderReader;
    correctOrder: CorrectControlOrderPort;
  }): CorrectControlOrder =>
  async ({ context, orderId, ...command }) => {
    const locations = resolveControlLocationIds(context.access);
    if (result.isErr(locations)) return locations;

    const current = await deps.getOrder({
      businessId: context.access.business.id,
      locationIds: locations.value,
      orderId,
    });
    if (result.isErr(current)) return current;

    const { customer, dueAt, ...remainingChanges } = command.changes;
    return deps.correctOrder({
      ...command,
      businessId: context.access.business.id,
      context: context.command,
      locationId: current.value.fulfillment.locationId,
      orderId,
      changes: {
        ...remainingChanges,
        ...(customer === undefined
          ? {}
          : { customer: toControlOrderCustomerReference(customer) }),
        ...(dueAt === undefined ? {} : { dueAt: new Date(dueAt) }),
      },
    });
  };
