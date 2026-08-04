import type {
  ControlFulfillmentEntity,
  ControlOrderEntity,
} from './control-order.entity.ts';
import type {
  ControlOrderCustomerReference,
  ControlOrderItem,
} from './control-order.value.ts';

export type ControlOrderCustomerProjection = Readonly<{
  resolution:
    | 'resolved'
    | 'not_provided'
    | 'pending'
    | 'conflict'
    | 'legacy_unknown';
  userId: string | null;
  displayName: string | null;
  phone: string | null;
  email: string | null;
}>;

export type ControlOrderSnapshot = ControlOrderEntity &
  Pick<ControlFulfillmentEntity, 'fulfillmentId' | 'fulfillmentVersion'> &
  Readonly<{
    customer: ControlOrderCustomerProjection;
    fulfillment: Omit<
      ControlFulfillmentEntity,
      'fulfillmentId' | 'fulfillmentVersion'
    >;
  }>;

export type ControlOrderDetailSnapshot = ControlOrderSnapshot &
  Readonly<{ items: readonly ControlOrderItem[] }>;

export type ControlOrder = Readonly<{
  id: string;
  version: number;
  displayNumber: string | null;
  state: ControlOrderEntity['state'];
  dueAt: string;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
  customer: ControlOrderCustomerProjection;
  fulfillment: ControlOrderSnapshot['fulfillment'] &
    Readonly<{ id: string; version: number }>;
  createdAt: string;
  updatedAt: string;
}>;

export type ControlOrderDetail = ControlOrder &
  Readonly<{ items: readonly ControlOrderItem[] }>;

export type ControlOrderList = Readonly<{
  items: readonly ControlOrder[];
  nextCursor: string | null;
}>;

export type ControlOrderMutation = Readonly<{
  orderId: string;
  fulfillmentId: string;
  version: number;
  replayed: boolean;
}>;

export type ControlOrderDescriptionChanges = Readonly<{
  customer?: ControlOrderCustomerReference;
  displayNumber?: string | null;
  dueAt?: Date;
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
