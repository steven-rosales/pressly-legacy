import type {
  ControlFulfillmentReleaseState,
  ControlOrderState,
} from './control-order.value.ts';

export type ControlOrderEntity = Readonly<{
  orderId: string;
  businessId: string;
  orderVersion: number;
  displayNumber: string | null;
  state: ControlOrderState;
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type ControlFulfillmentEntity = Readonly<{
  fulfillmentId: string;
  fulfillmentVersion: number;
  typeCode: string;
  locationId: string;
  releaseState: ControlFulfillmentReleaseState;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: string | null;
  bagCount: number | null;
}>;
