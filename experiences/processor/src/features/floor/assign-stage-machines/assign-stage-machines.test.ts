import {
  productionMutationResultSchema,
  type ProductionMutationResult,
} from "@pressly/production-system/contracts/floor/assign-stage-machines"
import { describe, expect, it, vi } from "vitest"
import {
  makeAssignStageMachinesClient,
  type AssignStageMachinesRequestTransport,
} from "./client.ts"
import { makeAssignStageMachinesWorkflow } from "./workflow.ts"
import type { AssignStageMachinesClientOperation } from "./types.ts"

const operation: AssignStageMachinesClientOperation = {
  operationId: "production.assign-stage-machines.v1",
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    machines: {
      method: "PUT",
      path: "/locations/:locationId/stages/:stageRunId/machines",
    },
  },
}

const result: ProductionMutationResult = {
  entityId: "11111111-1111-4111-8111-111111111111",
  version: 4,
  replayed: false,
}

describe("Processor assign-stage-machines experience", () => {
  it("maps the typed command body through declared route metadata", async () => {
    const request = vi
      .fn<AssignStageMachinesRequestTransport>()
      .mockResolvedValue(result)
    const assignStageMachines = makeAssignStageMachinesClient({
      operation,
      request,
    })

    await expect(
      assignStageMachines({
        locationId: "location/one",
        stageRunId: "stage two",
        machineIds: ["machine-2", "machine-1"],
        expectedVersion: 3,
        idempotencyKey: "assign-machines-key",
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "PUT",
        path: "/locations/location%2Fone/stages/stage%20two/machines",
        body: {
          machineIds: ["machine-2", "machine-1"],
          expectedVersion: 3,
          idempotencyKey: "assign-machines-key",
        },
      },
      productionMutationResultSchema
    )
  })

  it("owns the stable idempotency identity and payload", async () => {
    const makeIdempotencyKey = vi.fn().mockResolvedValue("assign-key")
    const execute = vi.fn().mockResolvedValue(result)
    const assignStageMachines = makeAssignStageMachinesWorkflow({
      execute,
      makeIdempotencyKey,
    })
    const intent = {
      locationId: "location-1",
      stageRunId: "stage-1",
      machineIds: ["machine-1"],
      expectedVersion: 2,
    } as const

    await expect(assignStageMachines(intent)).resolves.toEqual(result)

    expect(makeIdempotencyKey).toHaveBeenCalledWith({
      operation: "assign-stage-machines",
      payload: intent,
    })
    expect(execute).toHaveBeenCalledWith({
      ...intent,
      idempotencyKey: "assign-key",
    })
  })
})
