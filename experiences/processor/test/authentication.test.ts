import { describe, expect, it } from "vitest"
import {
  processorAuthBoundaryRequirements,
  processorAuthenticationCellDeclarations,
} from "../src/server.ts"

describe("Processor server authentication Experience", () => {
  it("adds four server-only cookie-realm operations", () => {
    expect(Object.keys(processorAuthenticationCellDeclarations)).toHaveLength(4)
    expect(processorAuthBoundaryRequirements).toHaveLength(4)
    expect(
      processorAuthBoundaryRequirements.every(
        (requirement) => requirement.profile.noStore
      )
    ).toBe(true)
  })
})
