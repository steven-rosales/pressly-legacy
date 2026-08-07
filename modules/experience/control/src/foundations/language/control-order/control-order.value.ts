import type { JsonValue } from '@pressly/codec';

export type ControlOrderState = 'open' | 'completed' | 'canceled';

export type ControlFulfillmentReleaseState =
  | 'unreleased'
  | 'released'
  | 'withdrawn';

export type ControlDirectCustomerInput =
  | Readonly<{ resolution: 'resolved'; userId: string }>
  | Readonly<{ resolution: 'not_provided'; userId: null }>;

export type ControlOrderCustomerReference =
  | Readonly<{
      resolution: 'resolved';
      userId: string;
      externalUserId: null;
    }>
  | Readonly<{
      resolution: 'not_provided';
      userId: null;
      externalUserId: null;
    }>;

export type ControlOrderItem = Readonly<{
  lineKey: string;
  itemType: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalAmountCents: number;
  sourceMetadata: JsonValue;
}>;

export type ControlOrderFulfillmentInput = Readonly<{
  typeCode: string;
  locationId: string;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: string | null;
}>;
