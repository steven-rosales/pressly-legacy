import { describe, expect, it } from "vitest"
import { makeBrowserLocationPreferenceAdapter } from "@/adapters/location/browser-location-preference.adapter"

describe("processor location preference", () => {
  it("persists only the selected non-secret location identifier", () => {
    const preference = makeBrowserLocationPreferenceAdapter(localStorage)
    preference.save("plant-east")
    expect(preference.read()).toBe("plant-east")
    expect(Object.keys(localStorage)).toEqual(["pressly.processor.location"])
    preference.clear()
    expect(preference.read()).toBeNull()
  })
})
