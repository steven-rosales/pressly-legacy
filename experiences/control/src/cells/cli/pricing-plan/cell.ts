import { planSurface } from "./cli.ts"
import { planContract } from "./contract.ts"
import { declareQueryCell } from "@pressly/cells"

export const adminCliPricingPlanCellDeclaration = declareQueryCell({
  id: "control.cli-pricing-plan.v1",
  authentication: "none",
  contract: planContract,
  surfaces: [planSurface],
  observability: { operation: "control.cli.pricing_plan" },
})
