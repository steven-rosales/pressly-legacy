import { render, screen } from "@testing-library/react"
import { proveExperienceFeature } from "@pressly/testkit/experience-feature-proof"
import { processorAuthenticationFeature } from "./feature.ts"
import userEvent from "@testing-library/user-event"
import { expect, vi } from "vitest"
import { AuthenticationView } from "./authentication.view.tsx"

proveExperienceFeature({
  featureId: "processor.authentication",
  feature: processorAuthenticationFeature,
  scenarios: [
    {
      name: "submits the entered credentials through the feature callback",
      proves: ["presentation-state", "component-interaction"],
      run: async () => {
        const user = userEvent.setup()
        const onLogin = vi.fn(async () => undefined)

        render(
          <AuthenticationView
            mode="login"
            busy={false}
            error={null}
            onLogin={onLogin}
            onCompleteMfa={vi.fn(async () => undefined)}
            onRestart={vi.fn()}
          />
        )

        await user.type(
          screen.getByLabelText(/email/i),
          "operator@pressly.test"
        )
        await user.type(screen.getByLabelText(/password/i), "correct-password")
        await user.click(screen.getByRole("button", { name: /sign in/i }))

        expect(onLogin).toHaveBeenCalledWith({
          email: "operator@pressly.test",
          password: "correct-password",
        })
      },
    },
  ],
})
