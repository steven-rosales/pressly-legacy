import type { ReactNode } from "react"
import { render, type RenderResult } from "@testing-library/react"
import {
  ControlBrowserCapabilitiesProvider,
  type ControlBrowserCapabilities,
  type ControlBrowserLocation,
  type ControlBrowserStorageChange,
} from "../../src/browser/browser-capabilities.tsx"

export type ControlBrowserCapabilitiesFixture = Readonly<{
  capabilities: ControlBrowserCapabilities
  storage: ReadonlyMap<string, string>
  language: () => "en" | "es"
  theme: () => "dark" | "light"
  clipboard: () => string
}>

export const makeControlBrowserCapabilitiesFixture = (
  input: Readonly<{
    location?: Partial<ControlBrowserLocation>
    now?: Date
    id?: string
  }> = {},
): ControlBrowserCapabilitiesFixture => {
  const storage = new Map<string, string>()
  const storageListeners = new Set<
    (change: ControlBrowserStorageChange) => void
  >()
  let language: "en" | "es" = "en"
  let theme: "dark" | "light" = "light"
  let clipboard = ""
  const location: ControlBrowserLocation = Object.freeze({
    hash: input.location?.hash ?? "",
    hostname: input.location?.hostname ?? "localhost",
    origin: input.location?.origin ?? "http://localhost:3000",
    pathname: input.location?.pathname ?? "/",
    search: input.location?.search ?? "",
  })

  const capabilities: ControlBrowserCapabilities = Object.freeze({
    storage: Object.freeze({
      read: (key: string) => storage.get(key) ?? null,
      write: (key: string, value: string) => {
        storage.set(key, value)
        for (const listener of storageListeners)
          listener(Object.freeze({ key, newValue: value }))
      },
    }),
    localization: Object.freeze({
      applyLanguage: (next: "en" | "es") => {
        language = next
      },
    }),
    theme: Object.freeze({
      apply: (next: "dark" | "light") => {
        theme = next
      },
      subscribe: (listener: (change: ControlBrowserStorageChange) => void) => {
        storageListeners.add(listener)
        return () => storageListeners.delete(listener)
      },
    }),
    clipboard: Object.freeze({
      writeText: async (value: string) => {
        clipboard = value
      },
    }),
    navigation: Object.freeze({
      read: () => location,
      replace: () => undefined,
      reload: () => undefined,
    }),
    clock: Object.freeze({
      now: () => new Date(input.now ?? "2026-08-23T16:00:00.000Z"),
      schedule: () => () => undefined,
    }),
    ids: Object.freeze({
      next: () => input.id ?? "00000000-0000-4000-8000-000000000001",
    }),
  })

  return Object.freeze({
    capabilities,
    storage,
    language: () => language,
    theme: () => theme,
    clipboard: () => clipboard,
  })
}

export const ControlBrowserCapabilitiesFixtureProvider = ({
  fixture,
  children,
}: Readonly<{
  fixture: ControlBrowserCapabilitiesFixture
  children: ReactNode
}>) => (
  <ControlBrowserCapabilitiesProvider capabilities={fixture.capabilities}>
    {children}
  </ControlBrowserCapabilitiesProvider>
)

export const withControlBrowserCapabilities = (
  children: ReactNode,
  fixture: ControlBrowserCapabilitiesFixture = makeControlBrowserCapabilitiesFixture(),
) => (
  <ControlBrowserCapabilitiesFixtureProvider fixture={fixture}>
    {children}
  </ControlBrowserCapabilitiesFixtureProvider>
)

export const renderWithControlBrowserCapabilities = (
  children: ReactNode,
  fixture: ControlBrowserCapabilitiesFixture = makeControlBrowserCapabilitiesFixture(),
): RenderResult => render(withControlBrowserCapabilities(children, fixture))
