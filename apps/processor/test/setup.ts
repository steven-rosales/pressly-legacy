import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import { afterEach } from "vitest"

configure({ asyncUtilTimeout: 5_000 })

if (HTMLElement.prototype.hasPointerCapture === undefined)
  HTMLElement.prototype.hasPointerCapture = () => false
if (HTMLElement.prototype.setPointerCapture === undefined)
  HTMLElement.prototype.setPointerCapture = () => undefined
if (HTMLElement.prototype.releasePointerCapture === undefined)
  HTMLElement.prototype.releasePointerCapture = () => undefined
if (HTMLElement.prototype.scrollIntoView === undefined)
  HTMLElement.prototype.scrollIntoView = () => undefined

afterEach(cleanup)
