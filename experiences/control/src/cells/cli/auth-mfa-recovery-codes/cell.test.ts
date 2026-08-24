import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { adminCliAuthMfaRecoveryCodesCellDeclaration } from "./cell.ts"
import { recoverySurface } from "./cli.ts"

import {
  expectControlCliDiagnosticFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-auth-mfa-recovery-codes.v1",
  declaration: adminCliAuthMfaRecoveryCodesCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth mfa recovery codes preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          adminCliAuthMfaRecoveryCodesCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          adminCliAuthMfaRecoveryCodesCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          adminCliAuthMfaRecoveryCodesCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          adminCliAuthMfaRecoveryCodesCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "cli",
          name: ["auth", "mfa-recovery-codes"],
          arguments: [],
        })
        expect(recoverySurface.options.map(({ name }) => name)).toEqual([
          "json",
          "help",
        ])
        await expectControlOperationSuccess(
          "control.cli-auth-mfa-recovery-codes.v1",
        )
      },
    },
    {
      name: "preserves arbitrary diagnostic code under the finite CLI failure kind",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlCliDiagnosticFailure(
          "control.cli-auth-mfa-recovery-codes.v1",
          "diagnostic",
        )
      },
    },
  ],
})
