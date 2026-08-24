import { defineExperienceFeature } from "@pressly/cells"

export const controlCustomersFeature = defineExperienceFeature({
  id: "control.customers",
  uses: [
    "control.list-customers.v1",
    "control.get-customer.v1",
    "control.create-customer.v1",
    "control.update-customer.v1",
  ],
  stateProofs: [
    "experiences/control/src/features/customers/customer-workspace.test.tsx",
  ],
  componentProofs: [
    "experiences/control/src/features/customers/customer-workspace.test.tsx",
  ],
})
