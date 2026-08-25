import { defineExperienceFeature } from '@pressly/cells';

export const customerPricingFeature = defineExperienceFeature({
  id: 'customer.web.pricing',
  uses: ['pricing.load-pricing-catalog.v1'],
  stateProofs: [
    'experiences/customer/src/web/features/pricing/pricing-interaction.test.tsx',
  ],
  componentProofs: [
    'experiences/customer/src/web/features/pricing/pricing-interaction.test.tsx',
  ],
});
