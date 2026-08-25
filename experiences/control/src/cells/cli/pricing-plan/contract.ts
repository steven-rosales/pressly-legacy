import {
  defineAdminCliContract,
  pricingChangeInputSchema,
  pricingPlanSchema,
} from "../../../cli/model.ts"

export const planContract = defineAdminCliContract({
  label: "control.cli-pricing-plan.v1",
  input: pricingChangeInputSchema,
  output: pricingPlanSchema,
})
