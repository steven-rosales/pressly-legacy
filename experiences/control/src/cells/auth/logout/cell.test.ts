import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlLogoutCellDeclaration } from "./cell.ts"

import {
  expectControlFailureKind,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.logout.v1",
  declaration: controlLogoutCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "logout preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(controlLogoutCellDeclaration.contract.input.version).toBe(1)
        expect(controlLogoutCellDeclaration.contract.output.version).toBe(1)
        expect(controlLogoutCellDeclaration.contract.failure.version).toBe(1)
        expect(controlLogoutCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/auth/logout",
        })
        await expectControlOperationSuccess("control.logout.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.logout.v1",
  declaration: controlLogoutCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "logout returns authentication when Access rejects the session",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind("control.logout.v1", "authentication"),
    },
    {
      name: "logout returns permission when the identity has no Control access",
      proves: ["executor-success"],
      run: () => expectControlFailureKind("control.logout.v1", "permission"),
    },
  ],
})
