import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { processorCompleteMfaChallengeCellDeclaration } from "./cell.ts"

import {
  expectProcessorAuthenticationFailure,
  expectProcessorOperationSuccess,
} from "../../../../test/support/processor-operation-proof.ts"

proveOperation({
  operationId: "processor.complete-mfa-challenge.v1",
  declaration: processorCompleteMfaChallengeCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "complete mfa challenge preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          processorCompleteMfaChallengeCellDeclaration.contract.input.version
        ).toBe(1)
        expect(
          processorCompleteMfaChallengeCellDeclaration.contract.output.version
        ).toBe(1)
        expect(
          processorCompleteMfaChallengeCellDeclaration.contract.failure.version
        ).toBe(1)
        expect(
          processorCompleteMfaChallengeCellDeclaration.surfaces[0]
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/processor/auth/mfa/challenge",
        })
        await expectProcessorOperationSuccess(
          "processor.complete-mfa-challenge.v1"
        )
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
            "processor.complete-mfa-challenge.v1",
            kind
          )
      },
    },
  ],
})
