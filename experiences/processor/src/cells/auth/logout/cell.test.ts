import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { processorLogoutCellDeclaration } from "./cell.ts"

import {
  expectProcessorAuthenticationFailure,
  expectProcessorOperationSuccess,
} from "../../../../test/support/processor-operation-proof.ts"

proveOperation({
  operationId: "processor.logout.v1",
  declaration: processorLogoutCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "logout preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(processorLogoutCellDeclaration.contract.input.version).toBe(1)
        expect(processorLogoutCellDeclaration.contract.output.version).toBe(1)
        expect(processorLogoutCellDeclaration.contract.failure.version).toBe(1)
        expect(processorLogoutCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/processor/auth/logout",
        })
        await expectProcessorOperationSuccess("processor.logout.v1")
      },
    },
    {
      name: "returns every finite authentication failure kind without narrowing diagnostic codes",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        for (const kind of [
          "authentication",
          "conflict",
          "permission",
          "rate_limit",
        ] as const)
          await expectProcessorAuthenticationFailure(
            "processor.logout.v1",
            kind
          )
      },
    },
  ],
})
