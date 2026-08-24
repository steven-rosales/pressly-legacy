import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { adminCliPricingShowCellDeclaration } from "./cell.ts"

import {
  expectControlCliDiagnosticFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-pricing-show.v1",
  declaration: adminCliPricingShowCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli pricing show preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(adminCliPricingShowCellDeclaration.contract.input.version).toBe(
          1,
        )
        expect(adminCliPricingShowCellDeclaration.contract.output.version).toBe(
          1,
        )
        expect(
          adminCliPricingShowCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(adminCliPricingShowCellDeclaration.surfaces[0]).toMatchObject({
          kind: "cli",
          name: ["pricing", "show"],
        })
        await expectControlOperationSuccess("control.cli-pricing-show.v1")
      },
    },
    {
      name: "preserves arbitrary diagnostic code under the finite CLI failure kind",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlCliDiagnosticFailure(
          "control.cli-pricing-show.v1",
          "diagnostic",
        )
      },
    },
  ],
})
