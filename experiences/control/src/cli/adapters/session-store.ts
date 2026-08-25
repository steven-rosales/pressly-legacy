import {
  cliSessionSchema,
  type CliSession as StoredCliSession,
} from "../contracts-v1.ts"
import { configError } from "@pressly/errors/factories"
import type { AdminCliSessionStore, CliSession } from "../model.ts"
import { cliFailureFromUnknown } from "./outcome.ts"

export type AdminSessionFileAccess = Readonly<{
  read: (path: string) => Promise<string | undefined>
  writePrivate: (path: string, value: string) => Promise<void>
  clear: (path: string) => Promise<void>
}>

const sessionStoreError = (cause: unknown) =>
  configError({
    code: "session_store_failed",
    message: "Could not access CLI session storage.",
    safeMessage: "Could not access CLI session storage.",
    cause,
  })

const asCliSession = (value: StoredCliSession): CliSession => value

export const makeAdminSessionStore = (
  input: Readonly<{
    path: string
    files: AdminSessionFileAccess
  }>,
): AdminCliSessionStore => ({
  read: async () => {
    try {
      const raw = await input.files.read(input.path)
      if (raw === undefined)
        return Object.freeze({ kind: "success" as const, value: undefined })

      return Object.freeze({
        kind: "success" as const,
        value: asCliSession(cliSessionSchema.parse(JSON.parse(raw))),
      })
    } catch (cause) {
      return Object.freeze({
        kind: "failure" as const,
        failure: cliFailureFromUnknown(sessionStoreError(cause)),
      })
    }
  },

  write: async (session) => {
    try {
      await input.files.writePrivate(
        input.path,
        `${JSON.stringify(session, null, 2)}\n`,
      )
      return Object.freeze({ kind: "success" as const, value: undefined })
    } catch (cause) {
      return Object.freeze({
        kind: "failure" as const,
        failure: cliFailureFromUnknown(sessionStoreError(cause)),
      })
    }
  },

  clear: async () => {
    try {
      await input.files.clear(input.path)
      return Object.freeze({ kind: "success" as const, value: undefined })
    } catch (cause) {
      return Object.freeze({
        kind: "failure" as const,
        failure: cliFailureFromUnknown(sessionStoreError(cause)),
      })
    }
  },
})
