import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlCompleteMfaChallengeCellDeclaration } from "./cell.ts"

import {
  expectControlFailureKind,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.complete-mfa-challenge.v1",
  declaration: controlCompleteMfaChallengeCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "complete mfa challenge preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlCompleteMfaChallengeCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          controlCompleteMfaChallengeCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          controlCompleteMfaChallengeCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          controlCompleteMfaChallengeCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/auth/mfa/challenge",
        })
        await expectControlOperationSuccess("control.complete-mfa-challenge.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.complete-mfa-challenge.v1",
  declaration: controlCompleteMfaChallengeCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "complete mfa challenge returns authentication when Access rejects the challenge",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.complete-mfa-challenge.v1",
          "authentication",
        ),
    },
    {
      name: "complete mfa challenge returns permission when the identity has no Control access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.complete-mfa-challenge.v1",
          "permission",
        ),
    },
  ],
})
