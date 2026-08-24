import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { adminCliAuthMfaConfirmCellDeclaration } from "./cell.ts"
import { confirmSurface, mapConfirmInput } from "./cli.ts"

import {
  expectControlCliDiagnosticFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-auth-mfa-confirm.v1",
  declaration: adminCliAuthMfaConfirmCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth mfa confirm preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          adminCliAuthMfaConfirmCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          adminCliAuthMfaConfirmCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          adminCliAuthMfaConfirmCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(adminCliAuthMfaConfirmCellDeclaration.surfaces[0]).toMatchObject(
          {
            kind: "cli",
            name: ["auth", "mfa-confirm"],
            arguments: [],
            stdin: {
              mode: "required",
              encoding: "utf8",
              maxBytes: 128,
              tty: "forbid",
            },
          },
        )
        expect(confirmSurface.options.map(({ name }) => name)).toEqual([
          "secret-stdin",
          "json",
          "help",
        ])
        expect(
          mapConfirmInput({
            command: { id: confirmSurface.id, name: confirmSurface.name },
            arguments: {},
            options: { "secret-stdin": true },
            stdin: "123456\r\n",
            context: {},
            prompt: null,
            signal: new AbortController().signal,
          }),
        ).toEqual({ kind: "valid", value: { code: "123456" } })
        await expectControlOperationSuccess("control.cli-auth-mfa-confirm.v1")
      },
    },
    {
      name: "preserves arbitrary diagnostic code under the finite CLI failure kind",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlCliDiagnosticFailure(
          "control.cli-auth-mfa-confirm.v1",
          "diagnostic",
        )
      },
    },
  ],
})
