import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import i18next from "i18next"
import { afterEach, beforeEach } from "vitest"
import {
  controlLanguageStorageKey,
  initializeControlLocalization,
} from "@/i18n"
import { controlThemeStorageKey } from "@/app/theme-provider"

configure({ asyncUtilTimeout: 5_000 })
initializeControlLocalization(window.localStorage)

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
  window.localStorage.removeItem(controlLanguageStorageKey)
  window.localStorage.removeItem(controlThemeStorageKey)
  await i18next.changeLanguage("en")
  document.documentElement.classList.remove("light", "dark")
})

afterEach(() => {
  cleanup()
  window.localStorage.removeItem(controlLanguageStorageKey)
  window.localStorage.removeItem(controlThemeStorageKey)
  document.documentElement.classList.remove("light", "dark")
})
