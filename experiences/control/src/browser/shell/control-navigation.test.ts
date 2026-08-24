import { describe, expect, it } from "vitest"
import {
  mayOpenControlView,
  navigationForCapabilities,
} from "./control-navigation"

describe("Control capability navigation", () => {
  it("shows only workspaces granted by server capabilities", () => {
    const sections = navigationForCapabilities(["orders:read", "team:read"])

    expect(sections.flatMap(({ items }) => items.map(({ id }) => id))).toEqual([
      "orders",
      "team",
      "configuration",
    ])
    expect(mayOpenControlView("orders", ["orders:read"])).toBe(true)
    expect(mayOpenControlView("security", ["orders:read"])).toBe(false)
  })

  it("always permits non-authoritative browser preference workspaces", () => {
    expect(mayOpenControlView("home", [])).toBe(true)
    expect(mayOpenControlView("configuration", [])).toBe(true)
    expect(
      navigationForCapabilities([]).flatMap(({ items }) =>
        items.map(({ id }) => id),
      ),
    ).toEqual(["configuration"])
  })

  it("keeps MFA setup reachable before privileged capabilities unlock", () => {
    const capabilities = ["control:view", "auth:mfa:enroll"]
    const sections = navigationForCapabilities(capabilities)

    expect(sections.flatMap(({ items }) => items.map(({ id }) => id))).toEqual([
      "security",
      "configuration",
    ])
    expect(mayOpenControlView("security", capabilities)).toBe(true)
  })
})
