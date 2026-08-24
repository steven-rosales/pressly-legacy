import { describe, expect, it } from "vitest"
import {
  controlAuthenticatedSessionSchema,
  isAllowedApplicationHref,
} from "./control-session"

const validSession = {
  status: "authenticated" as const,
  principal: {
    identityId: "8a283721-7ff9-4d18-a497-e3a0dca576b7",
    displayName: "Olivia Press",
    email: "olivia@example.com",
  },
  access: {
    business: {
      id: "404d5ca3-72cb-4ed8-8fbf-95b6a371a9a6",
      name: "Pressly One",
    },
    locations: [
      {
        id: "pressly-one",
        name: "Laundry Production",
        timezone: "America/New_York",
      },
    ],
    selectedLocationId: "pressly-one",
    capabilities: ["team:read"],
    applications: [
      {
        id: "processor" as const,
        label: "Pressly Processor",
        description: "Run laundry production.",
        href: "https://processor.trypressly.com/",
      },
      {
        id: "control" as const,
        label: "Pressly Control",
        description: "Manage the business.",
        href: "https://control.trypressly.com/",
      },
    ],
  },
  expiresAt: "2026-07-30T12:00:00.000Z",
  csrfToken: "a".repeat(43),
}

describe("control authenticated session", () => {
  it("accepts canonical text production location identifiers", () => {
    expect(controlAuthenticatedSessionSchema.parse(validSession)).toEqual(
      validSession,
    )
  })

  it.each([
    ["processor", "javascript:alert(1)"],
    ["processor", "https://unknown.example/"],
    ["control", "https://processor.trypressly.com/"],
    ["control", "https://control.trypressly.com/?redirect=unknown"],
  ] as const)("rejects unsafe %s application destination %s", (id, href) => {
    expect(isAllowedApplicationHref(id, href)).toBe(false)
    expect(() =>
      controlAuthenticatedSessionSchema.parse({
        ...validSession,
        access: {
          ...validSession.access,
          applications: [
            {
              id,
              label: "Unsafe",
              description: "Unsafe destination.",
              href,
            },
          ],
        },
      }),
    ).toThrow()
  })

  it.each([
    ["processor", "http://localhost:4173/"],
    ["control", "http://127.0.0.1:4174/"],
    ["processor", "https://processor.pressly.test:44117/"],
    ["control", "https://control.pressly.test:44117/"],
  ] as const)("allows the bounded %s development destination", (id, href) => {
    expect(isAllowedApplicationHref(id, href)).toBe(true)
  })

  it.each([
    ["processor", "https://control.pressly.test:44117/"],
    ["control", "https://control.pressly.test/"],
    ["control", "http://control.pressly.test:44117/"],
  ] as const)("rejects an unbounded %s test destination", (id, href) => {
    expect(isAllowedApplicationHref(id, href)).toBe(false)
  })
})
