import { defineExperienceFeature } from "@pressly/cells"

export const processorOrderResolutionFeature = defineExperienceFeature({
  id: "processor.order-resolution",
  uses: [
    "processor.preview-production-order-backlog.v1",
    "production.commit-order-backlog.v1",
    "production.change-order-resolution.v1",
  ],
  stateProofs: [
    "experiences/processor/src/features/order-resolution/order-resolution-review.container.test.tsx",
  ],
  componentProofs: [
    "experiences/processor/src/features/order-resolution/order-resolution-review.container.test.tsx",
  ],
})
