import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { acceptExistingMfaCellDeclaration } from "./cell.ts"

import {
  expectControlFailureKind,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.accept-existing-invitation-mfa.v1",
  declaration: acceptExistingMfaCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "accept existing invitation mfa preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(acceptExistingMfaCellDeclaration.contract.input.version).toBe(1)
        expect(acceptExistingMfaCellDeclaration.contract.output.version).toBe(1)
        expect(acceptExistingMfaCellDeclaration.contract.failure.version).toBe(
          1,
        )
        expect(acceptExistingMfaCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/invitations/accept/existing/mfa",
        })
        await expectControlOperationSuccess(
          "control.accept-existing-invitation-mfa.v1",
        )
      },
    },
  ],
})

proveOperation({
  operationId: "control.accept-existing-invitation-mfa.v1",
  declaration: acceptExistingMfaCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "accept existing invitation mfa preserves validation from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation-mfa.v1",
          "validation",
        ),
    },
    {
      name: "accept existing invitation mfa preserves authentication from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation-mfa.v1",
          "authentication",
        ),
    },
    {
      name: "accept existing invitation mfa preserves permission from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation-mfa.v1",
          "permission",
        ),
    },
    {
      name: "accept existing invitation mfa preserves not_found from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation-mfa.v1",
          "not_found",
        ),
    },
    {
      name: "accept existing invitation mfa preserves conflict from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation-mfa.v1",
          "conflict",
        ),
    },
  ],
})
