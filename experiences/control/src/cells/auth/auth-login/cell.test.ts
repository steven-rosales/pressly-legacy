import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlLoginCellDeclaration } from "./cell.ts"

import {
  expectControlFailureKind,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.auth-login.v1",
  declaration: controlLoginCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "auth login preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(controlLoginCellDeclaration.contract.input.version).toBe(1)
        expect(controlLoginCellDeclaration.contract.output.version).toBe(1)
        expect(controlLoginCellDeclaration.contract.failure.version).toBe(1)
        expect(controlLoginCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/auth/login",
        })
        await expectControlOperationSuccess("control.auth-login.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.auth-login.v1",
  declaration: controlLoginCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "auth login returns authentication when Access rejects the credentials",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind("control.auth-login.v1", "authentication"),
    },
    {
      name: "auth login returns permission when the authenticated identity has no Control access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind("control.auth-login.v1", "permission"),
    },
    {
      name: "auth login returns rate_limit when Access throttles login",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind("control.auth-login.v1", "rate_limit"),
    },
  ],
})
