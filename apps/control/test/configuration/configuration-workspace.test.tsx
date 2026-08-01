import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ThemeProvider, controlThemeStorageKey } from "@/app/theme-provider"
import { ConfigurationWorkspace } from "@/features/configuration/configuration-workspace"
import { controlLanguageStorageKey } from "@/i18n"

describe("Control configuration", () => {
  it("switches language and appearance immediately on this browser", async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ConfigurationWorkspace />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole("radio", { name: "Español" }))

    expect(screen.getAllByText("Idioma")).not.toHaveLength(0)
    expect(document.documentElement.lang).toBe("es")
    expect(window.localStorage.getItem(controlLanguageStorageKey)).toBe("es")

    await user.click(screen.getByRole("radio", { name: "Oscuro" }))

    expect(document.documentElement).toHaveClass("dark")
    expect(window.localStorage.getItem(controlThemeStorageKey)).toBe("dark")
  })
})
