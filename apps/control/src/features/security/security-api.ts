import {
  controlSecurityEventListSchema,
  mfaEnrollmentResultSchema,
  mfaMutationResultSchema,
  mfaRecoveryCodesResultSchema,
  type ControlSecurityEvent,
  type MfaEnrollmentResult,
} from "@pressly/contracts/auth"
import type { ControlHttpClient } from "@/api/control-http-client"

export type MfaEnrollment = MfaEnrollmentResult
export type SecurityEvent = ControlSecurityEvent

export type ControlSecurityApi = Readonly<{
  beginMfaEnrollment: () => Promise<MfaEnrollment>
  confirmMfaEnrollment: (code: string) => Promise<readonly string[]>
  regenerateRecoveryCodes: () => Promise<readonly string[]>
  removeMfa: () => Promise<void>
  listSecurityEvents: (cursor?: string) => Promise<{
    events: readonly SecurityEvent[]
    nextCursor: string | null
  }>
}>

export function makeControlSecurityApi(
  client: ControlHttpClient,
): ControlSecurityApi {
  return {
    beginMfaEnrollment: () =>
      client.request(
        {
          method: "POST",
          path: "/control/auth/mfa/enrollment",
          csrf: true,
        },
        mfaEnrollmentResultSchema,
      ),
    confirmMfaEnrollment: async (code) =>
      (
        await client.request(
          {
            method: "POST",
            path: "/control/auth/mfa/enrollment/confirm",
            csrf: true,
            body: { code },
          },
          mfaRecoveryCodesResultSchema,
        )
      ).recoveryCodes,
    regenerateRecoveryCodes: async () =>
      (
        await client.request(
          {
            method: "POST",
            path: "/control/auth/mfa/recovery-codes/regenerate",
            csrf: true,
          },
          mfaRecoveryCodesResultSchema,
        )
      ).recoveryCodes,
    removeMfa: async () => {
      await client.request(
        {
          method: "POST",
          path: "/control/auth/mfa/remove",
          csrf: true,
        },
        mfaMutationResultSchema,
      )
    },
    listSecurityEvents: (cursor) =>
      client.request(
        {
          path: `/control/security/events?limit=25${
            cursor === undefined ? "" : `&cursor=${encodeURIComponent(cursor)}`
          }`,
        },
        controlSecurityEventListSchema,
      ),
  }
}
