import {
  makeControlHttpClient,
  type ControlHttpClient,
} from "@/api/control-http-client"
import {
  logoutResultSchema,
  type ControlAuthenticatedSession,
  type ControlLoginResult,
} from "@pressly/contracts/auth"
import type { ZodType } from "zod"
import {
  controlAuthenticatedSessionSchema,
  controlLoginResultSchema,
} from "./control-session"

export type ControlAuthenticationApi = Readonly<{
  restore: () => Promise<ControlAuthenticatedSession>
  login: (credentials: {
    email: string
    password: string
  }) => Promise<ControlLoginResult>
  completeMfa: (input: {
    method: "totp" | "recovery"
    code: string
  }) => Promise<ControlAuthenticatedSession>
  logout: () => Promise<void>
}>

export function makeControlAuthenticationApi(
  input: {
    client?: ControlHttpClient
    fetchImplementation?: typeof fetch
    apiBaseUrl?: string
  } = {},
): ControlAuthenticationApi {
  const client =
    input.client ??
    makeControlHttpClient({
      ...(input.fetchImplementation === undefined
        ? {}
        : { fetchImplementation: input.fetchImplementation }),
      ...(input.apiBaseUrl === undefined
        ? {}
        : { apiBaseUrl: input.apiBaseUrl }),
    })

  const request = async <Result>(
    requestInput: Parameters<ControlHttpClient["request"]>[0],
    schema: ZodType<Result>,
  ) => client.request(requestInput, schema)

  const accept = <Session extends ControlAuthenticatedSession>(
    session: Session,
  ) => {
    client.acceptCsrfToken(session.csrfToken)
    return session
  }

  return {
    restore: async () =>
      accept(
        await request(
          { path: "/control/auth/session" },
          controlAuthenticatedSessionSchema,
        ),
      ),
    login: async (credentials) => {
      const result = await request(
        {
          method: "POST",
          path: "/control/auth/login",
          body: credentials,
        },
        controlLoginResultSchema,
      )
      if (result.status === "authenticated") accept(result)
      else client.clearCsrfToken()
      return result
    },
    completeMfa: async (body) =>
      accept(
        await request(
          {
            method: "POST",
            path: "/control/auth/mfa/challenge",
            body,
          },
          controlAuthenticatedSessionSchema,
        ),
      ),
    logout: async () => {
      await request(
        {
          method: "POST",
          path: "/control/auth/logout",
          csrf: true,
        },
        logoutResultSchema,
      )
      client.clearCsrfToken()
    },
  }
}
