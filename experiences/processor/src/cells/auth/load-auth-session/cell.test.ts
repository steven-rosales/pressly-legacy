import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { processorLoadSessionCellDeclaration } from "./cell.ts"

import {
  expectProcessorAuthenticationFailure,
  expectProcessorOperationSuccess,
} from "../../../../test/support/processor-operation-proof.ts"

proveOperation({
  operationId: "processor.load-auth-session.v1",
  declaration: processorLoadSessionCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "load auth session preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(processorLoadSessionCellDeclaration.contract.input.version).toBe(
          1
        )
        expect(
          processorLoadSessionCellDeclaration.contract.output.version
        ).toBe(1)
        expect(
          processorLoadSessionCellDeclaration.contract.failure.version
        ).toBe(1)
        expect(processorLoadSessionCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/processor/auth/session",
        })
        await expectProcessorOperationSuccess("processor.load-auth-session.v1")
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
            "processor.load-auth-session.v1",
            kind
          )
      },
    },
  ],
})
