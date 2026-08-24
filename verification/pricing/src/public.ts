export const pricingVerificationOperationIds = Object.freeze([
  'pricing.load-pricing-catalog.v1',
  'pricing.plan-pricing-change.v1',
  'pricing.publish-pricing-change.v1',
]);

export const protectedPricingCatalogValues = Object.freeze({
  databaseSeed: Object.freeze({ deliveryFeeCents: 0, hangDryCents: 295 }),
  webStaticFallback: Object.freeze({ deliveryFeeCents: 0, hangDryCents: 295 }),
});
