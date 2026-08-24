import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlLoadSessionCellDeclaration } from "./cell.ts"

import {
  expectControlFailureKind,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.load-auth-session.v1",
  declaration: controlLoadSessionCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "load auth session preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(controlLoadSessionCellDeclaration.contract.input.version).toBe(1)
        expect(controlLoadSessionCellDeclaration.contract.output.version).toBe(
          1,
        )
        expect(controlLoadSessionCellDeclaration.contract.failure.version).toBe(
          1,
        )
        expect(controlLoadSessionCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/control/auth/session",
        })
        await expectControlOperationSuccess("control.load-auth-session.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.load-auth-session.v1",
  declaration: controlLoadSessionCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "load auth session returns authentication when Access rejects the session",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.load-auth-session.v1",
          "authentication",
        ),
    },
    {
      name: "load auth session returns permission when the identity has no Control access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind("control.load-auth-session.v1", "permission"),
    },
  ],
})
