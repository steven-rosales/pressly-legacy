import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { adminCliPricingPlanCellDeclaration } from "./cell.ts"

import {
  expectControlCliDiagnosticFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-pricing-plan.v1",
  declaration: adminCliPricingPlanCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli pricing plan preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(adminCliPricingPlanCellDeclaration.contract.input.version).toBe(
          1,
        )
        expect(adminCliPricingPlanCellDeclaration.contract.output.version).toBe(
          1,
        )
        expect(
          adminCliPricingPlanCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(adminCliPricingPlanCellDeclaration.surfaces[0]).toMatchObject({
          kind: "cli",
          name: ["pricing", "plan"],
        })
        await expectControlOperationSuccess("control.cli-pricing-plan.v1")
      },
    },
    {
      name: "preserves arbitrary diagnostic code under the finite CLI failure kind",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlCliDiagnosticFailure(
          "control.cli-pricing-plan.v1",
          "diagnostic",
        )
      },
    },
  ],
})
