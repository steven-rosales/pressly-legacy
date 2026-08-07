export const pricingServiceSlugs = ['wash-fold', 'dry-cleaning'] as const;

export type PricingServiceSlug = (typeof pricingServiceSlugs)[number];
