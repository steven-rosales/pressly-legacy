import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlRemoveMfaCellDeclaration } from "./cell.ts"

import { expectControlOperationSuccess } from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.remove-mfa.v1",
  declaration: controlRemoveMfaCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "remove mfa preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(controlRemoveMfaCellDeclaration.contract.input.version).toBe(1)
        expect(controlRemoveMfaCellDeclaration.contract.output.version).toBe(1)
        expect(controlRemoveMfaCellDeclaration.contract.failure.version).toBe(1)
        expect(controlRemoveMfaCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/auth/mfa/remove",
        })
        await expectControlOperationSuccess("control.remove-mfa.v1")
      },
    },
  ],
})
