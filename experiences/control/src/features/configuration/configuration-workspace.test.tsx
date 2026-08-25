import { render, screen } from "@testing-library/react"
import { proveExperienceFeature } from "@pressly/testkit/experience-feature-proof"
import { controlConfigurationFeature } from "./feature"
import userEvent from "@testing-library/user-event"
import { describe, expect } from "vitest"
import {
  ThemeProvider,
  controlThemeStorageKey,
} from "../../browser/shell/theme-provider"
import { ConfigurationWorkspace } from "./configuration-workspace"
import {
  controlLanguageStorageKey,
  initializeControlLocalization,
} from "../../browser/localization"
import {
  makeControlBrowserCapabilitiesFixture,
  withControlBrowserCapabilities,
} from "../../../test/support/browser-capabilities.fixture.tsx"

describe("Control configuration", () => {
  proveExperienceFeature({
    featureId: "control.configuration",
    feature: controlConfigurationFeature,
    scenarios: [
      {
        name: "switches language and appearance immediately on this browser",
        proves: ["presentation-state", "component-interaction"],
        run: async () => {
          const user = userEvent.setup()
          const browser = makeControlBrowserCapabilitiesFixture()
          const localization = initializeControlLocalization(
            browser.capabilities.storage,
            browser.capabilities.localization,
          )
          render(
            withControlBrowserCapabilities(
              <ThemeProvider>
                <ConfigurationWorkspace />
              </ThemeProvider>,
              browser,
            ),
          )

          await user.click(screen.getByRole("radio", { name: "Español" }))

          expect(screen.getAllByText("Idioma")).not.toHaveLength(0)
          expect(browser.language()).toBe("es")
          expect(browser.storage.get(controlLanguageStorageKey)).toBe("es")

          await user.click(screen.getByRole("radio", { name: "Oscuro" }))

          expect(browser.theme()).toBe("dark")
          expect(browser.storage.get(controlThemeStorageKey)).toBe("dark")
          localization.dispose()
        },
      },
    ],
  })
})
