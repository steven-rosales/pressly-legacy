import { StrictMode, type ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  ControlApiError,
  type ControlAuthenticationApi,
} from "@/authentication/control-api"
import type { ControlAuthenticatedSession } from "@/authentication/control-session"
import { useAuthentication } from "@/authentication/use-authentication"

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

const StrictModeWrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>{children}</StrictMode>
)

describe("useAuthentication", () => {
  it("completes login after React Strict Mode replays the mount effect", async () => {
    const api: ControlAuthenticationApi = {
      restore: vi
        .fn()
        .mockRejectedValue(new ControlApiError(401, "authentication_required")),
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
  })
})
