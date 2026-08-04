import i18next from "i18next"
import { describe, expect, it } from "vitest"
import { controlErrorMessage } from "@/i18n/control-error-message"
import { controlApiErrorFixture } from "../support/control-api-error.fixture"

describe("Control error localization", () => {
  it("maps stable client error kinds to English presentation copy", () => {
    const error = controlApiErrorFixture("request_timeout")

    expect(controlErrorMessage(error, i18next.t, "Fallback message")).toBe(
      "The request took too long. Try again.",
    )
    expect(error.controlKind).toBe("request_timeout")
  })

  it("maps the same kinds to Spanish without exposing server text", async () => {
    await i18next.changeLanguage("es")
    const error = controlApiErrorFixture("authentication_required", {
      status: 401,
      code: "AUTH_INVALID_CREDENTIALS",
    })

    expect(controlErrorMessage(error, i18next.t, "Mensaje alternativo")).toBe(
      "Control no pudo confirmar tu identidad. Revisa tus credenciales o inicia sesión de nuevo.",
    )
    expect(
      controlErrorMessage(
        { message: "The email or password is incorrect." },
        i18next.t,
        "No se pudo iniciar sesión.",
      ),
    ).toBe("No se pudo iniciar sesión.")
  })

  it("uses feature-specific conflict copy", () => {
    const error = controlApiErrorFixture("conflict", { status: 409 })

    expect(
      controlErrorMessage(error, i18next.t, "Fallback", {
        conflict: "This customer changed. Refresh and review it.",
      }),
    ).toBe("This customer changed. Refresh and review it.")
  })
})
