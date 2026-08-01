import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import {
  controlThemeStorageKey,
  ThemeProvider,
  useTheme,
} from "@/app/theme-provider"

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
    const view = render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    )

    await waitFor(() => expect(document.documentElement).toHaveClass("light"))
    await user.click(screen.getByRole("button", { name: "light" }))

    expect(window.localStorage.getItem(controlThemeStorageKey)).toBe("dark")
    expect(document.documentElement).toHaveClass("dark")

    view.unmount()
    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    )
    expect(screen.getByRole("button", { name: "dark" })).toBeInTheDocument()
    expect(document.documentElement).toHaveClass("dark")
  })
})
