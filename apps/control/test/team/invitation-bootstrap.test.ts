import { describe, expect, it, vi } from "vitest"
import { consumeInvitationToken } from "@/features/team/invitation-bootstrap"

describe("invitation fragment bootstrap", () => {
  it("captures the token in memory and immediately scrubs it from history", () => {
    const replaceState = vi.fn()
    const token = "a".repeat(43)

    expect(
      consumeInvitationToken(
        {
          hash: `#invite=${token}&source=manager`,
          pathname: "/",
          search: "",
        },
        { state: { safe: true }, replaceState },
      ),
    ).toBe(token)
    expect(replaceState).toHaveBeenCalledWith(
      { safe: true },
      "",
      "/#source=manager",
    )
  })

  it("scrubs a malformed token without passing it to the API", () => {
    const replaceState = vi.fn()

    expect(
      consumeInvitationToken(
        { hash: "#invite=short", pathname: "/", search: "?safe=true" },
        { state: null, replaceState },
      ),
    ).toBeNull()
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?safe=true")
  })

  it("leaves unrelated fragments untouched", () => {
    const replaceState = vi.fn()

    expect(
      consumeInvitationToken(
        { hash: "#workspace=team", pathname: "/", search: "" },
        { state: null, replaceState },
      ),
    ).toBeNull()
    expect(replaceState).not.toHaveBeenCalled()
  })
})
