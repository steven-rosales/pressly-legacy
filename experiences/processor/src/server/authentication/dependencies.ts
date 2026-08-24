import type {
  AccessExecute,
  ProcessorBrowserPresentation,
  ResolveProcessorAccess,
} from "./model.ts"

export type ProcessorAuthenticationDependencies = Readonly<{
  login: AccessExecute<"login">
  loadSession: AccessExecute<"loadSession">
  revokeSession: AccessExecute<"revokeSession">
  completeMfaChallenge: AccessExecute<"completeMfaChallenge">
  resolveAccess: ResolveProcessorAccess
  presentation: ProcessorBrowserPresentation
}>
