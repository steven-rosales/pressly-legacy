import type { MfaEnrollmentResult } from "../../browser/contracts/authentication.ts"
import type { ControlSecurityEvent } from "../../browser/contracts/security.ts"

export type ControlSecurityApi = Readonly<{
  beginMfaEnrollment: () => Promise<MfaEnrollmentResult>
  confirmMfaEnrollment: (code: string) => Promise<readonly string[]>
  regenerateRecoveryCodes: () => Promise<readonly string[]>
  removeMfa: () => Promise<void>
  listSecurityEvents: (cursor?: string) => Promise<
    Readonly<{
      events: readonly ControlSecurityEvent[]
      nextCursor: string | null
    }>
  >
}>
