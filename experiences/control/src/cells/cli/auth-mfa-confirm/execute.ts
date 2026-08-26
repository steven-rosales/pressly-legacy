import type { AdminCliAuthDependencies } from "../../../cli/auth-dependencies.ts"
import type {
  AdminCliSessionStore,
  CliFailure,
  CliSession,
} from "../../../cli/model.ts"
import { cliFailure, readRequiredSession } from "../../../cli/model.ts"
import { adminCliAuthMfaConfirmCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

const withSession = async <Output>(
  store: AdminCliSessionStore,
  operation: (session: CliSession) => Promise<
    | Readonly<{
        kind: "failure"
        failure: CliFailure
      }>
    | Readonly<{
        kind: "success"
        value: Output
      }>
  >,
) => {
  const session = await readRequiredSession(store)
  return session.kind === "failure" ? session : operation(session.value)
}

export const makeAdminCliAuthMfaConfirmCell = (
  dependencies: AdminCliAuthDependencies,
) =>
  defineOperation(adminCliAuthMfaConfirmCellDeclaration, (input) => {
    const code = input.code
    if (code === undefined || code.trim() === "")
      return Promise.resolve({
        kind: "failure",
        failure: cliFailure(
          "invalid_cli_command",
          "An enrollment confirmation code is required in redirected standard input.",
        ),
      })
    return withSession(dependencies.session, (session) =>
      dependencies.api.confirmMfaEnrollment(session.accessToken, code),
    )
  })
