import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlRegenerateMfaRecoveryCodesCellDeclaration } from "./cell.ts"

import { expectControlOperationSuccess } from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.regenerate-mfa-recovery-codes.v1",
  declaration: controlRegenerateMfaRecoveryCodesCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "regenerate mfa recovery codes preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlRegenerateMfaRecoveryCodesCellDeclaration.contract.input
            .version,
        ).toBe(1)
        expect(
          controlRegenerateMfaRecoveryCodesCellDeclaration.contract.output
            .version,
        ).toBe(1)
        expect(
          controlRegenerateMfaRecoveryCodesCellDeclaration.contract.failure
            .version,
        ).toBe(1)
        expect(
          controlRegenerateMfaRecoveryCodesCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/auth/mfa/recovery-codes/regenerate",
        })
        await expectControlOperationSuccess(
          "control.regenerate-mfa-recovery-codes.v1",
        )
      },
    },
  ],
})
