import { invariantViolationError } from "@pressly/errors/factories"
import { createContext, useContext, type ReactNode } from "react"

export type ControlBrowserLocation = Readonly<{
  hash: string
  hostname: string
  origin: string
  pathname: string
  search: string
}>

export type ControlBrowserStorageChange = Readonly<{
  key: string | null
  newValue: string | null
}>

export type ControlBrowserCapabilities = Readonly<{
  storage: Readonly<{
    read: (key: string) => string | null
    write: (key: string, value: string) => void
  }>
  localization: Readonly<{
    applyLanguage: (language: "en" | "es") => void
  }>
  theme: Readonly<{
    apply: (theme: "dark" | "light") => void
    subscribe: (
      listener: (change: ControlBrowserStorageChange) => void,
    ) => () => void
  }>
  clipboard: Readonly<{
    writeText: (value: string) => Promise<void>
  }>
  navigation: Readonly<{
    read: () => ControlBrowserLocation
    replace: (path: string) => void
    reload: () => void
  }>
  clock: Readonly<{
    now: () => Date
    schedule: (callback: () => void, delayMs: number) => () => void
  }>
  ids: Readonly<{
    next: () => string
  }>
}>

const ControlBrowserCapabilitiesContext =
  createContext<ControlBrowserCapabilities | null>(null)

export const ControlBrowserCapabilitiesProvider = ({
  capabilities,
  children,
}: Readonly<{
  capabilities: ControlBrowserCapabilities
  children: ReactNode
}>) => (
  <ControlBrowserCapabilitiesContext.Provider value={capabilities}>
    {children}
  </ControlBrowserCapabilitiesContext.Provider>
)

export const useControlBrowserCapabilities = (): ControlBrowserCapabilities => {
  const capabilities = useContext(ControlBrowserCapabilitiesContext)
  if (capabilities !== null) return capabilities
  throw invariantViolationError({
    code: "control_browser_capabilities_missing",
    message:
      "Control browser capabilities must be provided by the browser runtime binding.",
  })
}
