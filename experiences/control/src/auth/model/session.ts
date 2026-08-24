import { invariantViolationError } from "@pressly/errors/factories"
import type { AccessExecute, AccessSuccess } from "./access.ts"
import type {
  ControlBrowserPresentation,
  ResolveControlAccess,
} from "./ports.ts"
import type {
  ControlAccess,
  ControlSessionFailure,
  ControlSession,
} from "./schemas.ts"

export type ControlSessionDependencies = Readonly<{
  loadSession: AccessExecute<"loadSession">
  revokeSession: AccessExecute<"revokeSession">
  resolveAccess: ResolveControlAccess
  presentation: ControlBrowserPresentation
}>

export const accessFailure = <
  Kind extends "authentication" | "conflict" | "rate_limit",
>(
  failure: Readonly<{
    kind: Kind
    code: string
    message: string
  }>,
  setCookieHeaders: readonly string[] = [],
  traceId?: string,
): Readonly<{
  kind: Kind
  code: string
  message: string
  safeMessage: string
  traceId?: string
  setCookieHeaders: string[]
}> => ({
  kind: failure.kind,
  code: failure.code,
  message: failure.message,
  safeMessage: failure.message,
  ...(traceId === undefined ? {} : { traceId }),
  setCookieHeaders: [...setCookieHeaders],
})

export const controlSession = (
  loaded: AccessSuccess<"loadSession">,
  access: ControlAccess,
  sessionToken: string,
  presentation: ControlBrowserPresentation,
): ControlSession => {
  const expiresAt = loaded.principal.sessionExpiresAt
  if (expiresAt === undefined)
    throw invariantViolationError({
      code: "loaded_control_session_missing_expiry",
      message: "Loaded Control session is missing its expiry.",
      safeMessage: "Session could not be loaded.",
    })
  return {
    status: "authenticated",
    principal: {
      identityId: loaded.principal.identityId,
      displayName: loaded.principal.displayName,
      ...(loaded.principal.email === undefined
        ? {}
        : { email: loaded.principal.email }),
    },
    access: {
      business: { ...access.business },
      locations: access.locations.map((location) => ({ ...location })),
      selectedLocationId: access.selectedLocationId,
      capabilities: [...access.capabilities],
      applications: access.applications.map((application) => ({
        ...application,
      })),
    },
    expiresAt,
    csrfToken: presentation.deriveCsrfToken(sessionToken),
  }
}

export const loadControlSession = async (
  dependencies: ControlSessionDependencies,
  sessionToken: string,
  requestId?: string,
): Promise<
  | Readonly<{ kind: "success"; session: ControlSession }>
  | Readonly<{ kind: "failure"; failure: ControlSessionFailure }>
> => {
  const loaded = await dependencies.loadSession.execute({
    bearerToken: sessionToken,
  })
  if (loaded.kind === "failure")
    return {
      kind: "failure",
      failure: accessFailure(
        loaded.failure,
        dependencies.presentation.serializeCookies([
          { action: "clear", cookie: "session" },
        ]),
        requestId,
      ),
    }

  const access = await dependencies.resolveAccess(loaded.value)
  if (access === null)
    return {
      kind: "failure",
      failure: {
        kind: "permission",
        code: "control_access_unavailable",
        message:
          "Identity has no unambiguous active owner or manager Control access.",
        safeMessage: "Your account does not have access to Pressly Control.",
        ...(requestId === undefined ? {} : { traceId: requestId }),
        setCookieHeaders: [
          ...dependencies.presentation.serializeCookies([
            { action: "clear", cookie: "session" },
          ]),
        ],
      },
    }
  return {
    kind: "success",
    session: controlSession(
      loaded.value,
      access,
      sessionToken,
      dependencies.presentation,
    ),
  }
}

export const establishControlSession = async (
  dependencies: ControlSessionDependencies,
  input: Readonly<{
    accessToken: string
    expiresAt: Date
    requestId?: string
  }>,
) => {
  const loaded = await dependencies.loadSession.execute({
    bearerToken: input.accessToken,
  })
  if (loaded.kind === "failure")
    return {
      kind: "failure" as const,
      failure: accessFailure(
        loaded.failure,
        dependencies.presentation.serializeCookies([
          { action: "clear", cookie: "mfa" },
        ]),
        input.requestId,
      ),
    }
  const access = await dependencies.resolveAccess(loaded.value)
  if (access === null) {
    await dependencies.revokeSession.execute({
      bearerToken: input.accessToken,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    })
    return {
      kind: "failure" as const,
      failure: {
        kind: "permission" as const,
        code: "control_access_unavailable",
        message:
          "Identity has no unambiguous active owner or manager Control access.",
        safeMessage: "Your account does not have access to Pressly Control.",
        ...(input.requestId === undefined ? {} : { traceId: input.requestId }),
        setCookieHeaders: [
          ...dependencies.presentation.serializeCookies([
            { action: "clear", cookie: "mfa" },
            { action: "clear", cookie: "session" },
          ]),
        ],
      },
    }
  }
  return {
    kind: "success" as const,
    session: controlSession(
      loaded.value,
      access,
      input.accessToken,
      dependencies.presentation,
    ),
    setCookieHeaders: [
      ...dependencies.presentation.serializeCookies([
        { action: "clear", cookie: "mfa" },
        {
          action: "set",
          cookie: "session",
          value: input.accessToken,
          expiresAt: input.expiresAt,
        },
      ]),
    ],
  }
}
