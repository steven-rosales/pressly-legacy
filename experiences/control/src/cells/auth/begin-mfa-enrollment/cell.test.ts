import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlBeginMfaEnrollmentCellDeclaration } from "./cell.ts"

import {
  expectControlFailureCode,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.begin-mfa-enrollment.v1",
  declaration: controlBeginMfaEnrollmentCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "begin mfa enrollment preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlBeginMfaEnrollmentCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          controlBeginMfaEnrollmentCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          controlBeginMfaEnrollmentCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          controlBeginMfaEnrollmentCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/auth/mfa/enrollment",
        })
        await expectControlOperationSuccess("control.begin-mfa-enrollment.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.begin-mfa-enrollment.v1",
  declaration: controlBeginMfaEnrollmentCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "begin mfa enrollment preserves mfa_already_enabled from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureCode(
          "control.begin-mfa-enrollment.v1",
          "mfa_already_enabled",
        ),
    },
  ],
})
