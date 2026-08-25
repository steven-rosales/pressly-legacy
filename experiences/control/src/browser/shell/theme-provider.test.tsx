import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import {
  controlThemeStorageKey,
  ThemeProvider,
  useTheme,
} from "./theme-provider"
import {
  makeControlBrowserCapabilitiesFixture,
  withControlBrowserCapabilities,
} from "../../../test/support/browser-capabilities.fixture.tsx"

function ThemeHarness() {
  const { theme, setTheme } = useTheme()
  return (
    <button type="button" onClick={() => setTheme("dark")}>
      {theme}
    </button>
  )
}

describe("Control theme preference", () => {
  it("defaults to light and persists an explicit dark preference", async () => {
    const user = userEvent.setup()
    const browser = makeControlBrowserCapabilitiesFixture()
    const view = render(
      withControlBrowserCapabilities(
        <ThemeProvider>
          <ThemeHarness />
        </ThemeProvider>,
        browser,
      ),
    )

    await waitFor(() => expect(browser.theme()).toBe("light"))
    await user.click(screen.getByRole("button", { name: "light" }))

    expect(browser.storage.get(controlThemeStorageKey)).toBe("dark")
    expect(browser.theme()).toBe("dark")

    view.unmount()
    render(
      withControlBrowserCapabilities(
        <ThemeProvider>
          <ThemeHarness />
        </ThemeProvider>,
        browser,
      ),
    )
    expect(screen.getByRole("button", { name: "dark" })).toBeInTheDocument()
    expect(browser.theme()).toBe("dark")
  })
})
