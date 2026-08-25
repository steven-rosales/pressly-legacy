import type { ControlSecurityEventList } from "../contracts/security.ts"
import type {
  BrowserHttpSurface,
  GeneratedBrowserOperation,
} from "../transport.ts"

export type ControlSecurityOperations = Readonly<{
  listSecurityEvents: GeneratedBrowserOperation<
    "control.list-security-events.v1",
    Readonly<{ events: BrowserHttpSurface<"GET"> }>
  >
}>

export type ControlSecurityBrowserClient = Readonly<{
  listSecurityEvents: (cursor?: string) => Promise<ControlSecurityEventList>
}>
