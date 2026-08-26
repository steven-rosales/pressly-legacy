import {
  schedulerConfigSchema,
  type SchedulerConfig,
} from "@pressly/production-system/contracts/read-models/production-schedule"
import { describe, expect, it, vi } from "vitest"
import {
  makePublishSchedulerConfigClient,
  type PublishSchedulerConfigRequestTransport,
} from "./client.ts"
import type { PublishSchedulerConfigClientOperation } from "./types.ts"

const operation: PublishSchedulerConfigClientOperation = {
  operationId: "production.publish-scheduler-config.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    "scheduler-configs": {
      method: "POST",
      path: "/production/locations/:locationId/scheduler-configs",
    },
  },
}

const result: SchedulerConfig = {
  id: "10000000-0000-4000-8000-000000000001",
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  algorithmVersion: "fixed-pulse-ffd-v2",
  version: 8,
  stageFitAssertion: {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
    assertedBy: "10000000-0000-4000-8000-000000000002",
    assertedAt: "2026-08-22T14:00:00.000Z",
  },
  publishedAt: "2026-08-22T14:00:00.000Z",
}

describe("Processor publish-scheduler-config experience", () => {
  it("preserves the command body and canonical result decoder through declared metadata", async () => {
    const request = vi
      .fn<PublishSchedulerConfigRequestTransport>()
      .mockResolvedValue(result)
    const publishConfig = makePublishSchedulerConfigClient({
      operation,
      request,
    })

    await expect(
      publishConfig({
        locationId: "pressly one/north",
        pulseMinutes: 56,
        foldLbsPerFolderMinute: 2,
        stageFitAssertion: {
          sortingFits: true,
          washingFits: true,
          dryingFits: true,
        },
        idempotencyKey: "publish-config-command-1",
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/production/locations/pressly%20one%2Fnorth/scheduler-configs",
        body: {
          pulseMinutes: 56,
          foldLbsPerFolderMinute: 2,
          stageFitAssertion: {
            sortingFits: true,
            washingFits: true,
            dryingFits: true,
          },
          idempotencyKey: "publish-config-command-1",
        },
      },
      schedulerConfigSchema
    )
  })
})
