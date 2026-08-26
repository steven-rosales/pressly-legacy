import type { AdminCliAuthDependencies } from "../../../cli/auth-dependencies.ts"
import type { CliLoginResult } from "../../../cli/model.ts"
import { cliFailure } from "../../../cli/model.ts"
import { adminCliAuthLoginCellDeclaration } from "./cell.ts"
import type { loginInputSchema } from "./contract.ts"
import { defineOperation } from "@pressly/cells"
import type { z } from "zod"

type LoginInput = z.output<typeof loginInputSchema>

const login = async (
  dependencies: AdminCliAuthDependencies,
  input: LoginInput,
) => {
  if (input.email === undefined || input.email.trim() === "")
    return {
      kind: "failure" as const,
      failure: cliFailure(
        "invalid_cli_command",
        "--email is required for auth login.",
      ),
    }
  if (input.password === undefined || input.password.trim() === "")
    return {
      kind: "failure" as const,
      failure: cliFailure(
        "invalid_cli_command",
        "A password is required in redirected login standard input.",
      ),
    }
  const started = await dependencies.api.login({
    email: input.email,
    password: input.password,
  })
  if (started.kind === "failure") return started
  let authenticated: CliLoginResult = started.value
  if ("status" in authenticated) {
    const secondFactor =
      input.mfaCode === undefined
        ? input.recoveryCode === undefined
          ? undefined
          : { method: "recovery" as const, code: input.recoveryCode }
        : { method: "totp" as const, code: input.mfaCode }
    if (secondFactor === undefined)
      return {
        kind: "failure" as const,
        failure: cliFailure(
          "mfa_code_required",
          "MFA is required. Supply either mfaCode or recoveryCode in redirected login JSON.",
        ),
      }
    const completed = await dependencies.api.completeMfaChallenge({
      challengeToken: authenticated.challengeToken,
      ...secondFactor,
    })
    if (completed.kind === "failure") return completed
    authenticated = completed.value
  }
  const stored = await dependencies.session.write(authenticated)
  return stored.kind === "failure"
    ? stored
    : { kind: "success" as const, value: authenticated }
}

export const makeAdminCliAuthLoginCell = (
  dependencies: AdminCliAuthDependencies,
) =>
  defineOperation(adminCliAuthLoginCellDeclaration, (input) =>
    login(dependencies, input),
  )
