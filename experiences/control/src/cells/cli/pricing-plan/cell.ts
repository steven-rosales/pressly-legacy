import { planSurface } from "./cli.ts"
import { planContract } from "./contract.ts"
import { defineOperation } from "@pressly/cells"

export const adminCliPricingPlanCellDeclaration = defineOperation({
  kind: "query",
  id: "control.cli-pricing-plan.v1",
  authentication: "none",
  contract: planContract,
  surfaces: [planSurface],
  observability: { operation: "control.cli.pricing_plan" },
})
