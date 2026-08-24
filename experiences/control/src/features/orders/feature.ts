import { defineExperienceFeature } from "@pressly/cells"

export const controlOrdersFeature = defineExperienceFeature({
  id: "control.orders",
  uses: [
    "control.list-orders.v1",
    "control.get-order.v1",
    "control.create-order.v1",
    "control.correct-order.v1",
    "control.list-customers.v1",
  ],
  stateProofs: [
    "experiences/control/src/features/orders/order-workspace.test.tsx",
  ],
  componentProofs: [
    "experiences/control/src/features/orders/order-workspace.test.tsx",
  ],
})
