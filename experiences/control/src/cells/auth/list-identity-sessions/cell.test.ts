import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlListIdentitySessionsCellDeclaration } from "./cell.ts"

import { expectControlOperationSuccess } from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.list-identity-sessions.v1",
  declaration: controlListIdentitySessionsCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "list identity sessions preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlListIdentitySessionsCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          controlListIdentitySessionsCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          controlListIdentitySessionsCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          controlListIdentitySessionsCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/control/auth/identities/:identityId/sessions",
        })
        await expectControlOperationSuccess("control.list-identity-sessions.v1")
      },
    },
  ],
})
