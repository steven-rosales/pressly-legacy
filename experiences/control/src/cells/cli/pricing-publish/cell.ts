import { publishSurface } from "./cli.ts"
import { publishContract } from "./contract.ts"
import { defineOperation } from "@pressly/cells"

export const adminCliPricingPublishCellDeclaration = defineOperation({
  kind: "command",
  id: "control.cli-pricing-publish.v1",
  authentication: "none",
  contract: publishContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [publishSurface],
  observability: { operation: "control.cli.pricing_publish" },
})
