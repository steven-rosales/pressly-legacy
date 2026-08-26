import { surface } from "./cli.ts"
import { contract } from "./contract.ts"
import { defineOperation } from "@pressly/cells"

export const productionBootstrapConcurrencyKey =
  "control.cli-bootstrap-production"

export const adminCliProductionBootstrapCellDeclaration = defineOperation({
  kind: "command",
  id: "control.cli-bootstrap-production.v2",
  authentication: "none",
  contract,
  consistency: {
    transaction: "none",
    concurrency: "partitioned",
    concurrencyKey: () => productionBootstrapConcurrencyKey,
  },
  idempotency: { required: false },
  surfaces: [surface],
  observability: { operation: "control.cli.bootstrap_production_v2" },
})
