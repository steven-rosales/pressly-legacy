import type { ReactNode } from "react"
import ControlApp from "./shell/control-app.tsx"
import { ControlErrorBoundary } from "./shell/control-error-boundary.tsx"
import type { ControlRuntime } from "./shell/control-runtime.ts"
import { ThemeProvider } from "./shell/theme-provider.tsx"
import { consumeInvitationToken } from "../features/team/invitation-bootstrap.ts"
import { initializeControlLocalization } from "./localization/index.ts"
import {
  ControlBrowserCapabilitiesProvider,
  type ControlBrowserCapabilities,
} from "./browser-capabilities.tsx"

export type ControlBrowserExperienceApplication = Readonly<{
  node: ReactNode
  dispose: () => void
}>

export const createControlBrowserExperience = (
  input: Readonly<{
    browser: ControlBrowserCapabilities
    clients: Omit<ControlRuntime, "initialInvitationToken">
    reportUnexpectedError: (
      error: Error,
      context: Readonly<{ componentStack: string }>,
    ) => void
  }>,
): ControlBrowserExperienceApplication => {
  const localization = initializeControlLocalization(
    input.browser.storage,
    input.browser.localization,
  )
  const location = input.browser.navigation.read()
  const runtime = {
    ...input.clients,
    initialInvitationToken: consumeInvitationToken(
      location,
      input.browser.navigation.replace,
    ),
  }

  return Object.freeze({
    node: (
      <ControlBrowserCapabilitiesProvider capabilities={input.browser}>
        <ThemeProvider defaultTheme="light">
          <ControlErrorBoundary
            report={input.reportUnexpectedError}
            reload={input.browser.navigation.reload}
          >
            <ControlApp runtime={runtime} />
          </ControlErrorBoundary>
        </ThemeProvider>
      </ControlBrowserCapabilitiesProvider>
    ),
    dispose: localization.dispose,
  })
}
