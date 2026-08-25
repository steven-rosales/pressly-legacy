import { defineExperienceFeature } from "@pressly/cells"

export const processorOrderControlFeature = defineExperienceFeature({
  id: "processor.order-control",
  uses: [
    "orders.list-incoming-order-proposals.v1",
    "orders.accept-incoming-order-proposal.v1",
    "orders.reject-incoming-order-proposal.v1",
    "orders.restore-incoming-order-proposal.v1",
    "processor.list-production-order-control.v1",
    "production.list-orders.v1",
    "production.preview-order-route.v1",
    "production.commit-order-route.v1",
  ],
  stateProofs: [
    "experiences/processor/src/features/order-control/incoming-orders.test.tsx",
    "experiences/processor/src/features/order-control/order-control-workspace.test.tsx",
  ],
  componentProofs: [
    "experiences/processor/src/features/order-control/incoming-orders.test.tsx",
    "experiences/processor/src/features/order-control/order-control-workspace.test.tsx",
  ],
})
