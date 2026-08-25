import { describe, expect, it } from "vitest"
import { z } from "zod"

import { defineAdminCliContract, type CliFailure } from "./model.ts"

describe("Admin CLI expected-failure contract", () => {
  it("keeps the finite diagnostic kind in application data without changing the serialized failure", () => {
    const contract = defineAdminCliContract({
      label: "control.cli-contract-proof.v1",
      input: z.object({}).strict(),
      output: z.object({ ok: z.boolean() }).strict(),
    })
    const failure: CliFailure = {
      kind: "diagnostic",
      code: "future_upstream_diagnostic",
      message: "A future upstream diagnostic was preserved.",
      traceId: "trace-1",
      details: { retryable: true },
    }
    const serialized = {
      code: "future_upstream_diagnostic",
      message: "A future upstream diagnostic was preserved.",
      traceId: "trace-1",
      details: { retryable: true },
    }

    expect(contract.failure.encode(failure)).toEqual(serialized)
    expect(contract.failure.decode(serialized)).toEqual({
      kind: "valid",
      value: failure,
    })
  })
})
