import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlRevokeAllIdentitySessionsCellDeclaration } from "./cell.ts"

import { expectControlOperationSuccess } from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.revoke-all-identity-sessions.v1",
  declaration: controlRevokeAllIdentitySessionsCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "revoke all identity sessions preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlRevokeAllIdentitySessionsCellDeclaration.contract.input
            .version,
        ).toBe(1)
        expect(
          controlRevokeAllIdentitySessionsCellDeclaration.contract.output
            .version,
        ).toBe(1)
        expect(
          controlRevokeAllIdentitySessionsCellDeclaration.contract.failure
            .version,
        ).toBe(1)
        expect(
          controlRevokeAllIdentitySessionsCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/auth/identities/:identityId/sessions/revoke-all",
        })
        await expectControlOperationSuccess(
          "control.revoke-all-identity-sessions.v1",
        )
      },
    },
  ],
})
