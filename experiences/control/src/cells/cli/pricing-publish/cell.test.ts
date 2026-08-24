import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { adminCliPricingPublishCellDeclaration } from "./cell.ts"

import {
  expectControlCliDiagnosticFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-pricing-publish.v1",
  declaration: adminCliPricingPublishCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli pricing publish preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          adminCliPricingPublishCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          adminCliPricingPublishCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          adminCliPricingPublishCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(adminCliPricingPublishCellDeclaration.surfaces[0]).toMatchObject(
          {
            kind: "cli",
            name: ["pricing", "publish"],
          },
        )
        await expectControlOperationSuccess("control.cli-pricing-publish.v1")
      },
    },
    {
      name: "preserves arbitrary diagnostic code under the finite CLI failure kind",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlCliDiagnosticFailure(
          "control.cli-pricing-publish.v1",
          "diagnostic",
        )
      },
    },
  ],
})
