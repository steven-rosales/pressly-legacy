import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  defineProcessorAuthContract,
  processorAuthFailureSchema,
  type ProcessorAuthFailure,
} from "./model.ts"

describe("Processor authentication expected-failure contract", () => {
  it.each(["authentication", "conflict", "permission", "rate_limit"] as const)(
    "round-trips the finite %s kind without narrowing its diagnostic code",
    (kind) => {
      const contract = defineProcessorAuthContract({
        label: "processor.auth-contract-proof.v1",
        input: z.object({}).strict(),
        output: z.object({ ok: z.boolean() }).strict(),
        failure: processorAuthFailureSchema,
      })
      const failure: ProcessorAuthFailure = {
        kind,
        code: `future_${kind}_code`,
        message: "A future authentication diagnostic was preserved.",
        safeMessage: "The authentication request could not be completed.",
        traceId: "trace-1",
        setCookieHeaders: [],
      }

      expect(contract.failure.encode(failure)).toEqual(failure)
      expect(contract.failure.decode(failure)).toEqual({
        kind: "valid",
        value: failure,
      })
    }
  )
})
