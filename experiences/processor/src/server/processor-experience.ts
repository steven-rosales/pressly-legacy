import type { ProcessorSessionDependencies } from "./authentication/session.ts"
import type { ProcessorAuthenticationDependencies } from "./authentication/dependencies.ts"
import type { ResolveProcessorAccess } from "./authentication/model.ts"
import { processorLoginCellDeclaration } from "../cells/auth/auth-login/cell.ts"
import { makeProcessorLoginCell } from "../cells/auth/auth-login/execute.ts"
import { processorCompleteMfaChallengeCellDeclaration } from "../cells/auth/complete-mfa-challenge/cell.ts"
import { makeProcessorCompleteMfaChallengeCell } from "../cells/auth/complete-mfa-challenge/execute.ts"
import { processorLoadSessionCellDeclaration } from "../cells/auth/load-auth-session/cell.ts"
import { makeProcessorLoadSessionCell } from "../cells/auth/load-auth-session/execute.ts"
import { processorLogoutCellDeclaration } from "../cells/auth/logout/cell.ts"
import { makeProcessorLogoutCell } from "../cells/auth/logout/execute.ts"
import { resolveProcessorAccessCellDeclaration } from "../cells/access/resolve-access/cell.ts"
import {
  makeResolveProcessorAccessCell,
  type ResolveProcessorAccessDependencies,
} from "../cells/access/resolve-access/execute.ts"
import {
  makeProcessorServerExperience,
  processorServerCellDeclarations,
  type ProcessorServerDependencies,
} from "./processor-server.ts"

export type ProcessorExperienceDependencies = ProcessorServerDependencies &
  Omit<ProcessorAuthenticationDependencies, "resolveAccess"> &
  ResolveProcessorAccessDependencies

export const processorAuthenticationCellDeclarations = Object.freeze({
  login: processorLoginCellDeclaration,
  completeMfaChallenge: processorCompleteMfaChallengeCellDeclaration,
  loadSession: processorLoadSessionCellDeclaration,
  logout: processorLogoutCellDeclaration,
})

export const processorCellDeclarations = Object.freeze({
  ...processorServerCellDeclarations,
  resolveAccess: resolveProcessorAccessCellDeclaration,
  ...processorAuthenticationCellDeclarations,
})

export const makeProcessorExperience = (
  dependencies: ProcessorExperienceDependencies
) => {
  const server = makeProcessorServerExperience(dependencies)
  const resolveAccess = makeResolveProcessorAccessCell(dependencies)
  const resolveProcessorAccess: ResolveProcessorAccess = async (session) => {
    const outcome = await resolveAccess.execute(session)
    if (outcome.kind === "failure") return outcome.failure
    return outcome.value
  }
  const sessionDependencies: ProcessorSessionDependencies = {
    loadSession: dependencies.loadSession,
    revokeSession: dependencies.revokeSession,
    resolveAccess: resolveProcessorAccess,
    presentation: dependencies.presentation,
  }

  return Object.freeze({
    cells: Object.freeze({
      ...server.cells,
      resolveAccess,
      login: makeProcessorLoginCell({
        ...sessionDependencies,
        login: dependencies.login,
      }),
      completeMfaChallenge: makeProcessorCompleteMfaChallengeCell({
        ...sessionDependencies,
        completeMfaChallenge: dependencies.completeMfaChallenge,
      }),
      loadSession: makeProcessorLoadSessionCell(sessionDependencies),
      logout: makeProcessorLogoutCell(sessionDependencies),
    }),
  })
}

export type ProcessorExperience = ReturnType<typeof makeProcessorExperience>
