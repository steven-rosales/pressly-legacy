import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import { afterEach, beforeEach } from "vitest"
import {
  initializeProcessorLocalization,
  processorLanguageStorageKey,
} from "@/i18n"

const localization = initializeProcessorLocalization(window.localStorage)

configure({ asyncUtilTimeout: 5_000 })

if (HTMLElement.prototype.hasPointerCapture === undefined)
  HTMLElement.prototype.hasPointerCapture = () => false
if (HTMLElement.prototype.setPointerCapture === undefined)
  HTMLElement.prototype.setPointerCapture = () => undefined
if (HTMLElement.prototype.releasePointerCapture === undefined)
  HTMLElement.prototype.releasePointerCapture = () => undefined
if (HTMLElement.prototype.scrollIntoView === undefined)
  HTMLElement.prototype.scrollIntoView = () => undefined

beforeEach(() => {
  void localization.changeLanguage("en")
  window.localStorage.removeItem(processorLanguageStorageKey)
})

afterEach(cleanup)
