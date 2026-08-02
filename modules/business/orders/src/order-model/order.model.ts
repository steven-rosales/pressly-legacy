export type OrderState = 'open' | 'completed' | 'canceled';
export type FulfillmentReleaseState = 'unreleased' | 'released' | 'withdrawn';

export type OrderCustomer =
  | Readonly<{
      resolution: 'resolved';
      userId: string;
      externalUserId: string | null;
    }>
  | Readonly<{
      resolution: 'not_provided';
      userId: null;
      externalUserId: null;
    }>
  | Readonly<{
      resolution: 'pending' | 'conflict';
      userId: null;
      externalUserId: string;
    }>
  | Readonly<{
      resolution: 'legacy_unknown';
      userId: null;
      externalUserId: string | null;
    }>;

export type OrderItemInput = Readonly<{
  lineKey: string;
  itemType: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalAmountCents: number;
  sourceMetadata: unknown;
}>;

export type FulfillmentInput = Readonly<{
  typeCode: string;
  locationId: string;
  releaseState: FulfillmentReleaseState;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: string | null;
  bagCount: number | null;
}>;

export type OrderInput = Readonly<{
  customer: OrderCustomer;
  displayNumber: string | null;
  state: OrderState;
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
  items: readonly OrderItemInput[];
  fulfillment: FulfillmentInput;
}>;

export type DirectFulfillmentInput = Omit<
  FulfillmentInput,
  'releaseState' | 'bagCount'
>;

/**
 * Descriptive facts accepted when Pressly creates a canonical Order.
 *
 * Commercial lifecycle, production admission, and physical intake are absent
 * by construction. The application owns their initial canonical values.
 */
export type DirectOrderInput = Omit<OrderInput, 'state' | 'fulfillment'> &
  Readonly<{ fulfillment: DirectFulfillmentInput }>;
