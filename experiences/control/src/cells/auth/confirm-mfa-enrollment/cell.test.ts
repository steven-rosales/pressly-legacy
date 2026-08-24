import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlConfirmMfaEnrollmentCellDeclaration } from "./cell.ts"

import {
  expectControlFailureCode,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.confirm-mfa-enrollment.v1",
  declaration: controlConfirmMfaEnrollmentCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "confirm mfa enrollment preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlConfirmMfaEnrollmentCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          controlConfirmMfaEnrollmentCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          controlConfirmMfaEnrollmentCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          controlConfirmMfaEnrollmentCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/auth/mfa/enrollment/confirm",
        })
        await expectControlOperationSuccess("control.confirm-mfa-enrollment.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.confirm-mfa-enrollment.v1",
  declaration: controlConfirmMfaEnrollmentCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "confirm mfa enrollment preserves invalid_mfa_code from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureCode(
          "control.confirm-mfa-enrollment.v1",
          "invalid_mfa_code",
        ),
    },
    {
      name: "confirm mfa enrollment preserves mfa_enrollment_missing from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureCode(
          "control.confirm-mfa-enrollment.v1",
          "mfa_enrollment_missing",
        ),
    },
  ],
})
