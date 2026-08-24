import { invariantViolationError } from "@pressly/errors/factories"
import type {
  AccessExecute,
  AccessSuccess,
  ProcessorAccess,
  ProcessorAuthFailure,
  ProcessorBrowserPresentation,
  ProcessorSession,
  ResolveProcessorAccess,
} from "./model.ts"
import { processorAccessFailure } from "./model.ts"

export type ProcessorSessionDependencies = Readonly<{
  loadSession: AccessExecute<"loadSession">
  revokeSession: AccessExecute<"revokeSession">
  resolveAccess: ResolveProcessorAccess
  presentation: ProcessorBrowserPresentation
}>

const projectSession = (
  loaded: AccessSuccess<"loadSession">,
  access: ProcessorAccess,
  sessionToken: string,
  presentation: ProcessorBrowserPresentation
): ProcessorSession => {
  const expiresAt = loaded.principal.sessionExpiresAt
  if (expiresAt === undefined)
    throw invariantViolationError({
      code: "loaded_session_missing_expiry",
      message: "Loaded processor session is missing its expiry.",
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
      locations: access.locations.map((location) => ({
        ...location,
        capabilities: [...location.capabilities],
      })),
      applications: access.applications.map((application) => ({
        ...application,
      })),
    },
    expiresAt,
    csrfToken: presentation.deriveCsrfToken(sessionToken),
  }
}

export const loadProcessorSession = async (
  dependencies: ProcessorSessionDependencies,
  sessionToken: string,
  requestId?: string
): Promise<
  | Readonly<{ kind: "success"; session: ProcessorSession }>
  | Readonly<{ kind: "failure"; failure: ProcessorAuthFailure }>
> => {
  const loaded = await dependencies.loadSession.execute({
    bearerToken: sessionToken,
  })
  if (loaded.kind === "failure")
    return {
      kind: "failure",
      failure: processorAccessFailure(
        loaded.failure,
        dependencies.presentation.serializeCookies([
          { action: "clear", cookie: "session" },
        ]),
        requestId
      ),
    }
  const access = await dependencies.resolveAccess(loaded.value)
  if (access === null)
    return {
      kind: "failure",
      failure: {
        kind: "permission",
        code: "processor_access_unavailable",
        message:
          "Identity has no active production capability at an active location.",
        safeMessage: "Your account does not have access to Pressly Processor.",
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
    session: projectSession(
      loaded.value,
      access,
      sessionToken,
      dependencies.presentation
    ),
  }
}

export const establishProcessorSession = async (
  dependencies: ProcessorSessionDependencies,
  input: Readonly<{
    accessToken: string
    expiresAt: Date
    requestId?: string
  }>
) => {
  const loaded = await dependencies.loadSession.execute({
    bearerToken: input.accessToken,
  })
  if (loaded.kind === "failure")
    return {
      kind: "failure" as const,
      failure: processorAccessFailure(
        loaded.failure,
        dependencies.presentation.serializeCookies([
          { action: "clear", cookie: "mfa" },
        ]),
        input.requestId
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
        code: "processor_access_unavailable",
        message:
          "Identity has no active production capability at an active location.",
        safeMessage: "Your account does not have access to Pressly Processor.",
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
    session: projectSession(
      loaded.value,
      access,
      input.accessToken,
      dependencies.presentation
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
