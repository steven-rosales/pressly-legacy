import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { acceptExistingPasswordCellDeclaration } from "./cell.ts"

import {
  expectControlFailureKind,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.accept-existing-invitation-password.v1",
  declaration: acceptExistingPasswordCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "accept existing invitation password preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          acceptExistingPasswordCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          acceptExistingPasswordCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          acceptExistingPasswordCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(acceptExistingPasswordCellDeclaration.surfaces[0]).toMatchObject(
          {
            kind: "http",
            method: "POST",
            path: "/control/invitations/accept/existing/password",
          },
        )
        await expectControlOperationSuccess(
          "control.accept-existing-invitation-password.v1",
        )
      },
    },
  ],
})

proveOperation({
  operationId: "control.accept-existing-invitation-password.v1",
  declaration: acceptExistingPasswordCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "accept existing invitation password preserves validation from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation-password.v1",
          "validation",
        ),
    },
    {
      name: "accept existing invitation password preserves authentication from Access login",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation-password.v1",
          "authentication",
        ),
    },
    {
      name: "accept existing invitation password preserves permission from invitation acceptance",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation-password.v1",
          "permission",
        ),
    },
    {
      name: "accept existing invitation password preserves not_found from preview",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation-password.v1",
          "not_found",
        ),
    },
    {
      name: "accept existing invitation password preserves conflict from preview",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation-password.v1",
          "conflict",
        ),
    },
    {
      name: "accept existing invitation password preserves rate_limit from Access login",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation-password.v1",
          "rate_limit",
        ),
    },
  ],
})
