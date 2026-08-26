import type { AdminCliAuthDependencies } from "../../../cli/auth-dependencies.ts"
import type {
  AdminCliSessionStore,
  CliFailure,
  CliSession,
} from "../../../cli/model.ts"
import { readRequiredSession } from "../../../cli/model.ts"
import { adminCliAuthMfaRecoveryCodesCellDeclaration } from "./cell.ts"
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

export const makeAdminCliAuthMfaRecoveryCodesCell = (
  dependencies: AdminCliAuthDependencies,
) =>
  defineOperation(adminCliAuthMfaRecoveryCodesCellDeclaration, (input) => {
    void input
    return withSession(dependencies.session, (session) =>
      dependencies.api.regenerateMfaRecoveryCodes(session.accessToken),
    )
  })
