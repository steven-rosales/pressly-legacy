import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react"
import { useState, type ReactNode } from "react"
import {
  ProcessorBrowserCapabilitiesProvider,
  type ProcessorBrowserCapabilities,
  type ProcessorBrowserKeyInput,
} from "../../src/browser/browser-capabilities.tsx"

export const makeProcessorBrowserCapabilitiesFixture =
  (): ProcessorBrowserCapabilities => {
    const readConnectivity = () => ({
      online: navigator.onLine,
      visible: document.visibilityState === "visible",
    })
    return {
      storage: {
        read: (key) => window.localStorage.getItem(key),
        write: (key, value) => window.localStorage.setItem(key, value),
        remove: (key) => window.localStorage.removeItem(key),
        subscribe: (listener) => {
          const handle = (event: StorageEvent) =>
            listener({ key: event.key, newValue: event.newValue })
          window.addEventListener("storage", handle)
          return () => window.removeEventListener("storage", handle)
        },
      },
      localization: {
        applyLanguage: (language) => {
          document.documentElement.lang = language
          document.documentElement.dir = "ltr"
        },
        readLanguage: () => document.documentElement.lang,
      },
      theme: {
        system: () =>
          window.matchMedia?.("(prefers-color-scheme: dark)").matches === true
            ? "dark"
            : "light",
        apply: (theme) => {
          document.documentElement.classList.remove("light", "dark")
          document.documentElement.classList.add(theme)
        },
        suppressTransitions: () => () => undefined,
        subscribeSystem: (listener) => {
          const media = window.matchMedia?.("(prefers-color-scheme: dark)")
          if (media === undefined) return () => undefined
          media.addEventListener("change", listener)
          return () => media.removeEventListener("change", listener)
        },
      },
      keyboard: {
        subscribe: (listener) => {
          const handle = (event: KeyboardEvent) =>
            listener({
              key: event.key,
              repeat: event.repeat,
              metaKey: event.metaKey,
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              editable: false,
              preventDefault: () => event.preventDefault(),
            } satisfies ProcessorBrowserKeyInput)
          window.addEventListener("keydown", handle)
          return () => window.removeEventListener("keydown", handle)
        },
      },
      viewport: {
        matches: (query) => window.matchMedia?.(query).matches ?? null,
        subscribe: (query, listener) => {
          const media = window.matchMedia?.(query)
          if (media === undefined) return () => undefined
          media.addEventListener("change", listener)
          return () => media.removeEventListener("change", listener)
        },
      },
      connectivity: {
        read: readConnectivity,
        subscribe: (listener) => {
          const publish = () => listener(readConnectivity())
          window.addEventListener("online", publish)
          window.addEventListener("offline", publish)
          document.addEventListener("visibilitychange", publish)
          return () => {
            window.removeEventListener("online", publish)
            window.removeEventListener("offline", publish)
            document.removeEventListener("visibilitychange", publish)
          }
        },
      },
      clock: {
        now: () => new Date(),
        monotonicNow: () => performance.now(),
      },
      scheduler: {
        schedule: (callback, delayMs) => {
          const handle = window.setTimeout(callback, delayMs)
          return () => window.clearTimeout(handle)
        },
        repeat: (callback, intervalMs) => {
          const handle = window.setInterval(callback, intervalMs)
          return () => window.clearInterval(handle)
        },
      },
      navigation: { reload: () => undefined },
      cookies: {
        write: (name, value, maxAgeSeconds) => {
          document.cookie = `${name}=${value}; path=/; max-age=${String(maxAgeSeconds)}`
        },
      },
    }
  }

export const ProcessorBrowserCapabilitiesFixtureProvider = ({
  children,
}: Readonly<{ children: ReactNode }>) => {
  const [capabilities] = useState(makeProcessorBrowserCapabilitiesFixture)
  return (
    <ProcessorBrowserCapabilitiesProvider capabilities={capabilities}>
      {children}
    </ProcessorBrowserCapabilitiesProvider>
  )
}

export const renderWithProcessorBrowserCapabilities = (
  ui: ReactNode,
  options: Omit<RenderOptions, "wrapper"> = {}
): RenderResult =>
  render(ui, {
    ...options,
    wrapper: ProcessorBrowserCapabilitiesFixtureProvider,
  })

export const renderHookWithProcessorBrowserCapabilities = <Result, Props>(
  callback: (props: Props) => Result,
  options: Omit<RenderHookOptions<Props>, "wrapper"> = {}
): RenderHookResult<Result, Props> =>
  renderHook(callback, {
    ...options,
    wrapper: ProcessorBrowserCapabilitiesFixtureProvider,
  })
