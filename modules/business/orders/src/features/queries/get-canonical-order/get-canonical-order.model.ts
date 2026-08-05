export type GetCanonicalOrderQuery = Readonly<{
  businessId: string;
  locationIds: readonly string[];
  orderId: string;
}>;
