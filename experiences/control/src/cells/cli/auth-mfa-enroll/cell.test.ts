import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { adminCliAuthMfaEnrollCellDeclaration } from "./cell.ts"
import { enrollmentSurface } from "./cli.ts"

import {
  expectControlCliDiagnosticFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-auth-mfa-enroll.v1",
  declaration: adminCliAuthMfaEnrollCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth mfa enroll preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          adminCliAuthMfaEnrollCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          adminCliAuthMfaEnrollCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          adminCliAuthMfaEnrollCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(adminCliAuthMfaEnrollCellDeclaration.surfaces[0]).toMatchObject({
          kind: "cli",
          name: ["auth", "mfa-enroll"],
          arguments: [],
        })
        expect(enrollmentSurface.options.map(({ name }) => name)).toEqual([
          "json",
          "help",
        ])
        await expectControlOperationSuccess("control.cli-auth-mfa-enroll.v1")
      },
    },
    {
      name: "preserves arbitrary diagnostic code under the finite CLI failure kind",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlCliDiagnosticFailure(
          "control.cli-auth-mfa-enroll.v1",
          "diagnostic",
        )
      },
    },
  ],
})
