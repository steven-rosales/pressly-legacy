import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { processorLoginCellDeclaration } from "./cell.ts"

import {
  expectProcessorAuthenticationFailure,
  expectProcessorOperationSuccess,
} from "../../../../test/support/processor-operation-proof.ts"

proveOperation({
  operationId: "processor.auth-login.v1",
  declaration: processorLoginCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "auth login preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(processorLoginCellDeclaration.contract.input.version).toBe(1)
        expect(processorLoginCellDeclaration.contract.output.version).toBe(1)
        expect(processorLoginCellDeclaration.contract.failure.version).toBe(1)
        expect(processorLoginCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/processor/auth/login",
        })
        await expectProcessorOperationSuccess("processor.auth-login.v1")
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
            "processor.auth-login.v1",
            kind
          )
      },
    },
  ],
})
