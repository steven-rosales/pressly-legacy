import type { AccessExecute, AccessSuccess } from "./access.ts"
import type { ControlAccess } from "./schemas.ts"
import type { CliSession } from "../../cli/model.ts"
import { invariantViolationError } from "@pressly/errors/factories"

export type ResolveControlIdentityAccess = (
  input: Readonly<{
    identityId: string
    assuranceLevel?: "mfa" | "password" | "service_key"
  }>,
) => Promise<ControlAccess | null>

export type CliAuthApiSessionDependencies = Readonly<{
  loadSession: AccessExecute<"loadSession">
  revokeSession: AccessExecute<"revokeSession">
  resolveIdentityAccess: ResolveControlIdentityAccess
}>

export const controlAccessUnavailable = () => ({
  kind: "permission" as const,
  code: "control_access_unavailable" as const,
  message:
    "Identity has no unambiguous active owner or manager Control access.",
})

const sessionRoles = (
  loaded: AccessSuccess<"loadSession">,
): readonly string[] =>
  [
    ...new Set(
      loaded.principalAttributes.assignments.flatMap((assignment) =>
        assignment.state === "active" ? [assignment.role] : [],
      ),
    ),
  ].sort()

export const loadCliAuthApiSession = async (
  dependencies: CliAuthApiSessionDependencies,
  input: Readonly<{
    accessToken: string
    requestId?: string
    revokeOnDenied: boolean
  }>,
): Promise<
  | Readonly<{ kind: "success"; value: CliSession }>
  | Readonly<{
      kind: "failure"
      failure:
        | Readonly<{
            kind: "authentication"
            code: "invalid_session" | "session_expired"
            message: string
          }>
        | ReturnType<typeof controlAccessUnavailable>
    }>
> => {
  const loaded = await dependencies.loadSession.execute({
    bearerToken: input.accessToken,
  })
  if (loaded.kind === "failure") return loaded

  const access =
    loaded.value.principal.audience === "customer"
      ? null
      : await dependencies.resolveIdentityAccess({
          identityId: loaded.value.principal.identityId,
          ...(loaded.value.principalAttributes.assuranceLevel === undefined
            ? {}
            : {
                assuranceLevel: loaded.value.principalAttributes.assuranceLevel,
              }),
        })
  if (access === null) {
    if (input.revokeOnDenied)
      await dependencies.revokeSession.execute({
        bearerToken: input.accessToken,
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
      })
    return { kind: "failure", failure: controlAccessUnavailable() }
  }

  const expiresAt = loaded.value.principal.sessionExpiresAt
  if (expiresAt === undefined)
    throw invariantViolationError({
      code: "loaded_cli_auth_api_session_missing_expiry",
      message: "Loaded Control CLI bearer session is missing its expiry.",
      safeMessage: "Session could not be loaded.",
    })

  return {
    kind: "success",
    value: {
      accessToken: input.accessToken,
      expiresAt: expiresAt.toISOString(),
      principal: {
        identityId: loaded.value.principal.identityId,
        displayName: loaded.value.principal.displayName,
        ...(loaded.value.principal.email === undefined
          ? {}
          : { email: loaded.value.principal.email }),
        roles: [...sessionRoles(loaded.value)],
      },
    },
  }
}

export const establishCliAuthApiSession = async (
  dependencies: CliAuthApiSessionDependencies,
  input: Readonly<{ accessToken: string; requestId?: string }>,
): Promise<
  | Readonly<{ kind: "success"; value: CliSession }>
  | Readonly<{
      kind: "failure"
      failure: ReturnType<typeof controlAccessUnavailable>
    }>
> => {
  const loaded = await loadCliAuthApiSession(dependencies, {
    ...input,
    revokeOnDenied: true,
  })
  if (loaded.kind === "failure") {
    if (loaded.failure.kind === "authentication")
      throw invariantViolationError({
        code: "issued_cli_auth_api_session_unloadable",
        message: `A newly issued Control CLI bearer session could not be loaded: ${loaded.failure.code}.`,
        safeMessage: "Session could not be established.",
      })
    return { kind: "failure", failure: loaded.failure }
  }
  return loaded
}
