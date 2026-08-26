import { describe, expect, it, vi } from "vitest"
import {
  advanceProductionStageResultSchema,
  type AdvanceProductionStageResult,
} from "@pressly/production-system/contracts/floor/advance-stage"
import {
  makeAdvanceStageClient,
  type AdvanceStageRequestTransport,
} from "./client.ts"
import { makeAdvanceStageWorkflow } from "./workflow.ts"
import type { AdvanceStageClientOperation } from "./types.ts"

const operation: AdvanceStageClientOperation = {
  operationId: "production.advance-stage.v1",
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    start: {
      method: "POST",
      path: "/locations/:locationId/stages/:stageRunId/start",
    },
    complete: {
      method: "POST",
      path: "/locations/:locationId/stages/:stageRunId/complete",
    },
  },
}

const result: AdvanceProductionStageResult = {
  entityId: "11111111-1111-4111-8111-111111111111",
  version: 4,
  replayed: false,
}

describe("Processor advance-stage experience", () => {
  it("maps typed commands through the declared structural route and canonical result schema", async () => {
    const request = vi
      .fn<AdvanceStageRequestTransport>()
      .mockResolvedValue(result)
    const advanceStage = makeAdvanceStageClient({ operation, request })
    const confirmation = {
      observedAt: "2026-08-21T14:00:00.000Z",
      confirmationHash: "a".repeat(64),
    }

    await expect(
      advanceStage({
        locationId: "location/one",
        stageRunId: "stage two",
        transition: "complete",
        expectedVersion: 3,
        idempotencyKey: "advance-stage-key",
        confirmation,
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/locations/location%2Fone/stages/stage%20two/complete",
        body: {
          expectedVersion: 3,
          idempotencyKey: "advance-stage-key",
          confirmation,
        },
      },
      advanceProductionStageResultSchema
    )
  })

  it("owns initial-attempt idempotency and request construction", async () => {
    const makeIdempotencyKey = vi.fn().mockResolvedValue("start-stage-key")
    const execute = vi.fn().mockResolvedValue(result)
    const advanceStage = makeAdvanceStageWorkflow({
      execute,
      makeIdempotencyKey,
    })

    await expect(
      advanceStage({
        kind: "attempt",
        locationId: "location-1",
        stageRunId: "stage-1",
        transition: "start",
        expectedVersion: 2,
      })
    ).resolves.toEqual(result)

    expect(makeIdempotencyKey).toHaveBeenCalledWith({
      operation: "start-production-stage",
      payload: {
        locationId: "location-1",
        stageRunId: "stage-1",
        transition: "start",
        expectedVersion: 2,
      },
    })
    expect(execute).toHaveBeenCalledWith({
      locationId: "location-1",
      stageRunId: "stage-1",
      transition: "start",
      expectedVersion: 2,
      idempotencyKey: "start-stage-key",
    })
  })

  it("preserves the confirmation-specific identity and payload envelope", async () => {
    const makeIdempotencyKey = vi.fn().mockResolvedValue("complete-stage-key")
    const execute = vi.fn().mockResolvedValue(result)
    const advanceStage = makeAdvanceStageWorkflow({
      execute,
      makeIdempotencyKey,
    })
    const confirmation = {
      observedAt: "2026-08-21T14:00:00.000Z",
      confirmationHash: "b".repeat(64),
    }

    await advanceStage({
      kind: "confirmation",
      locationId: "location-1",
      stageRunId: "stage-1",
      transition: "complete",
      expectedVersion: 3,
      confirmation,
    })

    expect(makeIdempotencyKey).toHaveBeenCalledWith({
      operation: "confirm-early-production-stage-completion",
      payload: {
        locationId: "location-1",
        stageRunId: "stage-1",
        expectedVersion: 3,
        confirmation,
      },
    })
    expect(execute).toHaveBeenCalledWith({
      locationId: "location-1",
      stageRunId: "stage-1",
      transition: "complete",
      expectedVersion: 3,
      idempotencyKey: "complete-stage-key",
      confirmation,
    })
  })
})
