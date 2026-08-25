import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlRevokeIdentitySessionCellDeclaration } from "./cell.ts"

import { expectControlOperationSuccess } from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.revoke-identity-session.v1",
  declaration: controlRevokeIdentitySessionCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "revoke identity session preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlRevokeIdentitySessionCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          controlRevokeIdentitySessionCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          controlRevokeIdentitySessionCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          controlRevokeIdentitySessionCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/auth/identities/:identityId/sessions/:sessionId/revoke",
        })
        await expectControlOperationSuccess(
          "control.revoke-identity-session.v1",
        )
      },
    },
  ],
})
