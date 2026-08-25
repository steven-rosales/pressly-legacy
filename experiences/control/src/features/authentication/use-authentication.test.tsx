import { StrictMode, type ReactNode } from "react"
import { proveExperienceFeature } from "@pressly/testkit/experience-feature-proof"
import { controlAuthenticationFeature } from "./feature"
import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, vi } from "vitest"
import type { ControlAuthenticationApi } from "./control-api"
import type { ControlAuthenticatedSession } from "../../browser/contracts/authentication.ts"
import { useAuthentication } from "./use-authentication"
import { controlApiErrorFixture } from "../../../test/support/control-api-error.fixture.ts"
import { withControlBrowserCapabilities } from "../../../test/support/browser-capabilities.fixture.tsx"

const session: ControlAuthenticatedSession = {
  status: "authenticated",
  principal: {
    identityId: "8a283721-7ff9-4d18-a497-e3a0dca576b7",
    displayName: "Olivia Press",
  },
  access: {
    business: {
      id: "404d5ca3-72cb-4ed8-8fbf-95b6a371a9a6",
      name: "Pressly One",
    },
    locations: [],
    selectedLocationId: null,
    capabilities: ["control:view"],
    applications: [],
  },
  expiresAt: "2030-07-30T12:00:00.000Z",
  csrfToken: "a".repeat(43),
}

const StrictModeWrapper = ({ children }: { children: ReactNode }) =>
  withControlBrowserCapabilities(<StrictMode>{children}</StrictMode>)

describe("useAuthentication", () => {
  proveExperienceFeature({
    featureId: "control.authentication",
    feature: controlAuthenticationFeature,
    scenarios: [
      {
        name: "completes login after React Strict Mode replays the mount effect",
        proves: ["presentation-state"],
        run: async () => {
          const api: ControlAuthenticationApi = {
            restore: vi.fn().mockRejectedValue(
              controlApiErrorFixture("authentication_required", {
                status: 401,
              }),
            ),
            login: vi.fn().mockResolvedValue(session),
            completeMfa: vi.fn(),
            logout: vi.fn(),
          }
          const { result } = renderHook(() => useAuthentication(api), {
            wrapper: StrictModeWrapper,
          })

          await waitFor(() =>
            expect(result.current.state.status).toBe("unauthenticated"),
          )

          await act(async () => {
            await result.current.login({
              email: "olivia@example.com",
              password: "valid-test-password",
            })
          })

          expect(result.current.busy).toBe(false)
          expect(result.current.state).toMatchObject({
            status: "authenticated",
            session,
          })
        },
      },
    ],
  })
})
