import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { adminCliAuthMfaRemoveCellDeclaration } from "./cell.ts"
import { removeSurface } from "./cli.ts"

import {
  expectControlCliDiagnosticFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-auth-mfa-remove.v1",
  declaration: adminCliAuthMfaRemoveCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth mfa remove preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          adminCliAuthMfaRemoveCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          adminCliAuthMfaRemoveCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          adminCliAuthMfaRemoveCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(adminCliAuthMfaRemoveCellDeclaration.surfaces[0]).toMatchObject({
          kind: "cli",
          name: ["auth", "mfa-remove"],
          arguments: [],
        })
        expect(removeSurface.options.map(({ name }) => name)).toEqual([
          "json",
          "help",
        ])
        await expectControlOperationSuccess("control.cli-auth-mfa-remove.v1")
      },
    },
    {
      name: "preserves arbitrary diagnostic code under the finite CLI failure kind",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlCliDiagnosticFailure(
          "control.cli-auth-mfa-remove.v1",
          "diagnostic",
        )
      },
    },
  ],
})
