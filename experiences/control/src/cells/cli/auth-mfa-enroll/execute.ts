import type { AdminCliAuthDependencies } from "../../../cli/auth-dependencies.ts"
import type {
  AdminCliSessionStore,
  CliFailure,
  CliSession,
} from "../../../cli/model.ts"
import { readRequiredSession } from "../../../cli/model.ts"
import { adminCliAuthMfaEnrollCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

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

export const makeAdminCliAuthMfaEnrollCell = (
  dependencies: AdminCliAuthDependencies,
) =>
  bindCell(adminCliAuthMfaEnrollCellDeclaration, (input) => {
    void input
    return withSession(dependencies.session, (session) =>
      dependencies.api.beginMfaEnrollment(session.accessToken),
    )
  })
