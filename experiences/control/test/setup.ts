import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import i18next from "i18next"
import { afterEach, beforeEach } from "vitest"
import {
  controlLanguageStorageKey,
  initializeControlLocalization,
} from "../src/browser/localization"
import { controlThemeStorageKey } from "../src/browser/shell/theme-provider"

configure({ asyncUtilTimeout: 5_000 })
initializeControlLocalization(
  {
    read: (key) => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value),
  },
  {
    applyLanguage: (language) => {
      document.documentElement.lang = language
      document.documentElement.dir = "ltr"
    },
  },
)

const inputOtpSelector = "[data-input-otp]"
const inputOtpCallbackDrainMs = 60

let inputOtpMountObserver: MutationObserver | undefined
let inputOtpWasMounted = false

function mutationsMountedInputOtp(mutations: MutationRecord[]): boolean {
  return mutations.some((mutation) =>
    Array.from(mutation.addedNodes).some(
      (node) =>
        node instanceof Element &&
        (node.matches(inputOtpSelector) ||
          node.querySelector(inputOtpSelector) !== null),
    ),
  )
}

if (HTMLElement.prototype.hasPointerCapture === undefined)
  HTMLElement.prototype.hasPointerCapture = () => false
if (HTMLElement.prototype.setPointerCapture === undefined)
  HTMLElement.prototype.setPointerCapture = () => undefined
if (HTMLElement.prototype.releasePointerCapture === undefined)
  HTMLElement.prototype.releasePointerCapture = () => undefined
if (HTMLElement.prototype.scrollIntoView === undefined)
  HTMLElement.prototype.scrollIntoView = () => undefined
if (globalThis.ResizeObserver === undefined)
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
if (document.elementFromPoint === undefined)
  document.elementFromPoint = () => null

beforeEach(async () => {
  inputOtpWasMounted = false
  inputOtpMountObserver = new MutationObserver((mutations) => {
    if (!mutationsMountedInputOtp(mutations)) return

    inputOtpWasMounted = true
    inputOtpMountObserver?.disconnect()
  })
  inputOtpMountObserver.observe(document.body, {
    childList: true,
    subtree: true,
  })

  window.localStorage.removeItem(controlLanguageStorageKey)
  window.localStorage.removeItem(controlThemeStorageKey)
  await i18next.changeLanguage("en")
  document.documentElement.classList.remove("light", "dark")
})

afterEach(async () => {
  const pendingMutations = inputOtpMountObserver?.takeRecords() ?? []
  const shouldDrainInputOtpCallbacks =
    inputOtpWasMounted ||
    mutationsMountedInputOtp(pendingMutations) ||
    document.querySelector(inputOtpSelector) !== null
  inputOtpMountObserver?.disconnect()
  inputOtpMountObserver = undefined

  cleanup()
  window.localStorage.removeItem(controlLanguageStorageKey)
  window.localStorage.removeItem(controlThemeStorageKey)
  document.documentElement.classList.remove("light", "dark")

  if (!shouldDrainInputOtpCallbacks) return

  // input-otp 1.4.2 leaves 0/10/50 ms state-sync callbacks alive after
  // unmount. Keep jsdom available long enough to drain only affected tests.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, inputOtpCallbackDrainMs)
  })
})
