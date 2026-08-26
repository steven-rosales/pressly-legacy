import { showSurface } from "./cli.ts"
import { showContract } from "./contract.ts"
import { defineOperation } from "@pressly/cells"

export const adminCliPricingShowCellDeclaration = defineOperation({
  kind: "query",
  id: "control.cli-pricing-show.v1",
  authentication: "none",
  contract: showContract,
  surfaces: [showSurface],
  observability: { operation: "control.cli.pricing_show" },
})
