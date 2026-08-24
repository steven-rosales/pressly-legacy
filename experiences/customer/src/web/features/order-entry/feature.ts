import { defineExperienceFeature } from '@pressly/cells';

export const customerOrderEntryFeature = defineExperienceFeature({
  id: 'customer.web.order-entry',
  uses: [],
  stateProofs: [
    'experiences/customer/src/web/features/order-entry/SchedulePickupButton.test.tsx',
  ],
  componentProofs: [
    'experiences/customer/src/web/features/order-entry/SchedulePickupButton.test.tsx',
  ],
});
