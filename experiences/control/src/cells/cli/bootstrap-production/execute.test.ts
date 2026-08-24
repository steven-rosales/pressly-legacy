import { proveOperation } from "@pressly/testkit/operation-proof"
import { describe, expect, it } from "vitest"
import {
  adminCliProductionBootstrapCellDeclaration,
  productionBootstrapConcurrencyKey,
} from "./cell.ts"
import {
  makeAdminCliProductionBootstrapCell,
  type PreparedProductionBootstrap,
} from "./execute.ts"
import type { BootstrapAuthorityResult } from "./contract.ts"

const command = (file: string) => ({
  file,
  actorId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "bootstrap-test-1",
  dryRun: false,
})

const authoritySuccess = (
  authority: string,
  dryRun: boolean,
  details: Readonly<Record<string, boolean | string>> = {},
) =>
  Promise.resolve({
    kind: "success" as const,
    value: {
      status: "converged" as const,
      mode: dryRun ? ("dry_run" as const) : ("apply" as const),
      applied: !dryRun,
      authority,
      ...details,
    } satisfies BootstrapAuthorityResult,
  })

const authorityFailure = (code: string) =>
  Promise.resolve({
    kind: "failure" as const,
    failure: {
      kind: "diagnostic" as const,
      code,
      message: `Synthetic ${code}.`,
    },
  })

const serialRunExclusive = () => {
  let tail = Promise.resolve()
  return <Value>(work: () => Promise<Value>): Promise<Value> => {
    const result = tail.then(work)
    tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

describe("Control production bootstrap workflow fence", () => {
  proveOperation({
    operationId: "control.cli-bootstrap-production.v2",
    declaration: adminCliProductionBootstrapCellDeclaration,
    layer: "unit",
    scenarios: [
      {
        name: "serializes divergent manifests across every owner preview and apply",
        proves: ["declared-concurrency-race"],
        run: async () => {
          const calls: string[] = []
          const prepared = (label: string): PreparedProductionBootstrap => {
            const step = async (authority: string, dryRun: boolean) => {
              calls.push(
                `${label}:${authority}:${dryRun ? "preview" : "apply"}`,
              )
              await Promise.resolve()
              return authoritySuccess(authority, dryRun)
            }
            return {
              manageLocation: ({ dryRun }) => step("access", dryRun),
              manageProduction: ({ dryRun }) => step("production", dryRun),
              manageSourceLocationBindings: ({ dryRun }) =>
                step("ingress", dryRun),
            }
          }
          const cell = makeAdminCliProductionBootstrapCell({
            runExclusive: serialRunExclusive(),
            prepare: async (file) => ({
              kind: "success",
              value: prepared(file),
            }),
          })

          const outcomes = await Promise.all([
            cell.execute(command("manifest-a.json")),
            cell.execute(command("manifest-b.json")),
          ])

          expect(outcomes.map(({ kind }) => kind)).toEqual([
            "success",
            "success",
          ])
          expect(calls).toEqual([
            "manifest-a.json:access:preview",
            "manifest-a.json:production:preview",
            "manifest-a.json:ingress:preview",
            "manifest-a.json:access:apply",
            "manifest-a.json:production:apply",
            "manifest-a.json:ingress:apply",
            "manifest-b.json:access:preview",
            "manifest-b.json:production:preview",
            "manifest-b.json:ingress:preview",
            "manifest-b.json:access:apply",
            "manifest-b.json:production:apply",
            "manifest-b.json:ingress:apply",
          ])
          expect(
            adminCliProductionBootstrapCellDeclaration.consistency.concurrencyKey?.(
              command("manifest-a.json"),
            ),
          ).toBe(productionBootstrapConcurrencyKey)
        },
      },
    ],
  })

  it("converges the same manifest after a late owner failure", async () => {
    const desired = "stable-manifest.json"
    const state: {
      location: string | null
      production: string | null
      bindings: string | null
    } = { location: null, production: null, bindings: null }
    let failBindingsApply = true
    let exclusiveRuns = 0
    const prepared: PreparedProductionBootstrap = {
      manageLocation: async ({ dryRun }) => {
        if (!dryRun) state.location = desired
        return authoritySuccess("access", dryRun, {
          outcome: dryRun || state.location !== desired ? "updated" : "noop",
        })
      },
      manageProduction: async ({ dryRun, idempotencyKey }) => {
        expect(idempotencyKey).toBe("bootstrap-test-1")
        const replayed = !dryRun && state.production === desired
        if (!dryRun) state.production = desired
        return authoritySuccess("production", dryRun, { replayed })
      },
      manageSourceLocationBindings: async ({ dryRun }) => {
        if (!dryRun && failBindingsApply) {
          failBindingsApply = false
          return authorityFailure("bindings_apply_failed")
        }
        if (!dryRun) state.bindings = desired
        return authoritySuccess("ingress", dryRun)
      },
    }
    const cell = makeAdminCliProductionBootstrapCell({
      runExclusive: async (work) => {
        exclusiveRuns += 1
        return work()
      },
      prepare: async () => ({ kind: "success", value: prepared }),
    })

    await expect(cell.execute(command(desired))).resolves.toMatchObject({
      kind: "failure",
      failure: { code: "bindings_apply_failed" },
    })
    expect(state).toEqual({
      location: desired,
      production: desired,
      bindings: null,
    })

    const retry = await cell.execute(command(desired))
    expect(retry).toMatchObject({
      kind: "success",
      value: {
        location: { status: "converged" },
        production: { status: "converged", replayed: true },
        sourceLocationBindings: { status: "converged" },
      },
    })
    expect(state).toEqual({
      location: desired,
      production: desired,
      bindings: desired,
    })
    expect(exclusiveRuns).toBe(2)
  })
})
