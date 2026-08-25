import { proveExperienceFeature } from "@pressly/testkit/experience-feature-proof"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, vi } from "vitest"
import { renderWithControlBrowserCapabilities as render } from "../../../test/support/browser-capabilities.fixture.tsx"
import { AuthenticationView } from "./authentication-view"
import { controlAuthenticationFeature } from "./feature"

describe("Authentication view", () => {
  proveExperienceFeature({
    featureId: "control.authentication",
    feature: controlAuthenticationFeature,
    scenarios: [
      {
        name: "submits credentials entered through the sign-in form",
        proves: ["component-interaction"],
        run: async () => {
          const onLogin = vi.fn().mockResolvedValue(undefined)
          const user = userEvent.setup()
          render(
            <AuthenticationView
              mode="login"
              busy={false}
              error={null}
              onLogin={onLogin}
              onCompleteMfa={vi.fn()}
              onRestart={vi.fn()}
            />,
          )

          await user.type(
            screen.getByRole("textbox", { name: "Email" }),
            "olivia@example.com",
          )
          await user.type(
            screen.getByLabelText("Password"),
            "valid-test-password",
          )
          await user.click(screen.getByRole("button", { name: "Sign in" }))

          await waitFor(() =>
            expect(onLogin).toHaveBeenCalledWith({
              email: "olivia@example.com",
              password: "valid-test-password",
            }),
          )
        },
      },
    ],
  })
})
