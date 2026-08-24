import { describe, expect, it } from "vitest"
import {
  controlAuthBoundaryRequirements,
  controlCliAuthApiBoundaryRequirements,
} from "../src/auth/boundary-profiles.ts"
import {
  controlAuthCellDeclarations,
  controlCliAuthApiCellDeclarations,
} from "../src/control-experience.ts"

describe("Control authentication Experience", () => {
  it("declares one selected cookie-realm profile for each of eleven operations", () => {
    expect(Object.keys(controlAuthCellDeclarations)).toHaveLength(11)
    expect(controlAuthBoundaryRequirements).toHaveLength(11)
    expect(
      new Set(
        controlAuthBoundaryRequirements.map(
          (requirement) => requirement.operationId,
        ),
      ),
    ).toEqual(
      new Set(
        Object.values(controlAuthCellDeclarations).map(
          (declaration) => declaration.id,
        ),
      ),
    )
  })

  it("declares conditional parsing and centralized cookie-failure observation", () => {
    expect(
      controlAuthBoundaryRequirements.filter(
        (requirement) =>
          requirement.profile.requestBody?.contentType === "parse-if-matching",
      ),
    ).toHaveLength(8)
    expect(
      controlAuthBoundaryRequirements.filter(
        (requirement) =>
          requirement.profile.expectedFailureObservation ===
          "cookie-auth-failure",
      ),
    ).toHaveLength(4)
  })

  it("declares no-store, request-rate and validation phases explicitly", () => {
    expect(
      controlAuthBoundaryRequirements.every(
        (requirement) => requirement.profile.noStore,
      ),
    ).toBe(true)
    expect(
      controlAuthBoundaryRequirements.find(
        (requirement) => requirement.operationId === "control.auth-login.v1",
      )?.profile,
    ).toMatchObject({
      requestRateLimit: "control-auth-login-rate-chain",
      inputValidationPhase: "after-authentication",
    })
  })

  it("declares eight isolated Control CLI bearer API profiles", () => {
    expect(Object.keys(controlCliAuthApiCellDeclarations)).toHaveLength(8)
    expect(controlCliAuthApiBoundaryRequirements).toHaveLength(8)
    expect(
      new Set(
        controlCliAuthApiBoundaryRequirements.map(
          (requirement) => requirement.operationId,
        ),
      ),
    ).toEqual(
      new Set(
        Object.values(controlCliAuthApiCellDeclarations).map(
          (declaration) => declaration.id,
        ),
      ),
    )
    expect(
      controlCliAuthApiBoundaryRequirements.filter(
        (requirement) => requirement.profile.authentication === null,
      ),
    ).toHaveLength(4)
    expect(
      controlCliAuthApiBoundaryRequirements.filter(
        (requirement) =>
          requirement.profile.authentication?.provider ===
            "control-bearer-session" &&
          requirement.profile.identityRateLimit === "control-identity",
      ),
    ).toHaveLength(4)
    expect(
      controlCliAuthApiBoundaryRequirements.every(
        (requirement) =>
          requirement.profile.exactOrigin === null &&
          requirement.profile.csrf === null &&
          requirement.profile.noStore,
      ),
    ).toBe(true)
  })
})
