import type { ReactNode } from "react"
import { ProcessorApp } from "./shell/app.tsx"
import { ThemeProvider } from "./shell/providers.tsx"
import type { ProcessorRuntime } from "./processor-runtime.ts"
import { initializeProcessorLocalization } from "./localization/index.ts"
import {
  ProcessorBrowserCapabilitiesProvider,
  type ProcessorBrowserCapabilities,
} from "./browser-capabilities.tsx"

export type ProcessorBrowserExperienceApplication = Readonly<{
  node: ReactNode
  dispose: () => void
}>

export const createProcessorBrowserExperience = (
  input: Readonly<{
    browser: ProcessorBrowserCapabilities
    runtime: ProcessorRuntime
  }>
): ProcessorBrowserExperienceApplication => {
  const localization = initializeProcessorLocalization(
    input.browser.storage,
    input.browser.localization
  )

  return Object.freeze({
    node: (
      <ProcessorBrowserCapabilitiesProvider capabilities={input.browser}>
        <ThemeProvider defaultTheme="light">
          <ProcessorApp runtime={input.runtime} />
        </ThemeProvider>
      </ProcessorBrowserCapabilitiesProvider>
    ),
    dispose: localization.dispose,
  })
}
