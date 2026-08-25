import {
  defineCliCatalog,
  type CliInteractiveFrame,
  type CliInteractiveInvocationResult,
  type CliInvocation,
  type ExecutableCell,
} from "@pressly/cells"
import { resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
  adminCliAuthCellDeclarations,
  adminCliCellDeclarations,
  adminCliPricingCellDeclarations,
  makeAdminCliExperience,
} from "../src/cli/admin-cli.ts"
import { makeAdminCliProductionBootstrapCell } from "../src/cells/cli/bootstrap-production/execute.ts"
import type { BootstrapAuthorityResult } from "../src/cells/cli/bootstrap-production/contract.ts"
import { makeAdminCliAuthLoginCell } from "../src/cells/cli/auth-login/execute.ts"
import { makeAdminCliAuthLogoutCell } from "../src/cells/cli/auth-logout/execute.ts"
import { makeAdminCliAuthMfaConfirmCell } from "../src/cells/cli/auth-mfa-confirm/execute.ts"
import { makeAdminCliAuthMfaEnrollCell } from "../src/cells/cli/auth-mfa-enroll/execute.ts"
import { makeAdminCliAuthMfaRecoveryCodesCell } from "../src/cells/cli/auth-mfa-recovery-codes/execute.ts"
import { makeAdminCliAuthMfaRemoveCell } from "../src/cells/cli/auth-mfa-remove/execute.ts"
import { makeAdminCliAuthSessionCell } from "../src/cells/cli/auth-session/execute.ts"
import { makeAdminCliPricingPlanCell } from "../src/cells/cli/pricing-plan/execute.ts"
import { makeAdminCliPricingPublishCell } from "../src/cells/cli/pricing-publish/execute.ts"
import { makeAdminCliPricingShowCell } from "../src/cells/cli/pricing-show/execute.ts"
import type { AdminCliAuthDependencies } from "../src/cli/auth-dependencies.ts"
import type { AdminCliPricingDependencies } from "../src/cli/pricing-dependencies.ts"
import type {
  AdminCliAuthApi,
  AdminCliPricingApi,
  AdminCliSessionStore,
  CliSession,
} from "../src/cli/model.ts"
import {
  authCliUsage,
  presslyAdminCliProgram,
  pricingCliUsage,
} from "../src/cli/presentation.ts"

const makeAdminCliAuthCells = (dependencies: AdminCliAuthDependencies) =>
  Object.freeze({
    login: makeAdminCliAuthLoginCell(dependencies),
    session: makeAdminCliAuthSessionCell(dependencies),
    logout: makeAdminCliAuthLogoutCell(dependencies),
    mfaEnroll: makeAdminCliAuthMfaEnrollCell(dependencies),
    mfaConfirm: makeAdminCliAuthMfaConfirmCell(dependencies),
    mfaRecoveryCodes: makeAdminCliAuthMfaRecoveryCodesCell(dependencies),
    mfaRemove: makeAdminCliAuthMfaRemoveCell(dependencies),
  })

const makeAdminCliPricingCells = (dependencies: AdminCliPricingDependencies) =>
  Object.freeze({
    show: makeAdminCliPricingShowCell(dependencies),
    plan: makeAdminCliPricingPlanCell(dependencies),
    publish: makeAdminCliPricingPublishCell(dependencies),
  })

const signal = new AbortController().signal

const invocation = (input: {
  name: readonly string[]
  options?: Readonly<Record<string, boolean | string | readonly string[]>>
  arguments?: Readonly<Record<string, string | readonly string[]>>
  stdin?: string | null
  context?: Readonly<Record<string, unknown>>
}): CliInvocation => ({
  command: { id: `${input.name.join(".")}.v1`, name: input.name },
  arguments: input.arguments ?? {},
  options: input.options ?? {},
  stdin: input.stdin ?? null,
  context: input.context ?? {},
  prompt: null,
  signal,
})

const runCell = async (cell: ExecutableCell, request: CliInvocation) => {
  const entry = defineCliCatalog([cell]).entries[0]!
  const decoded = await entry.decodeInvocation(request)
  if (decoded.kind === "invalid") {
    const failure = {
      code: "input_contract_invalid" as const,
      message: "The command input violates its contract.",
      details: { issues: decoded.issues },
    }
    return {
      kind: "invalid" as const,
      failure,
      presentation: entry.presentInvalidInvocation(failure),
    }
  }
  const outcome = await entry.execute(decoded.value)
  return {
    kind: "executed" as const,
    outcome,
    presentation: entry.present(outcome, request),
  }
}

const session: CliSession = {
  accessToken: "token_12345678901234567890123456789012",
  expiresAt: "2026-06-03T12:00:00.000Z",
  principal: {
    identityId: "00000000-0000-4000-8000-000000000001",
    displayName: "Steven",
    email: "steven@example.com",
    roles: ["owner"],
  },
}

const makeSessionStore = (initial: CliSession | null = session) => {
  const calls: string[] = []
  let value: CliSession | undefined = initial ?? undefined
  const store: AdminCliSessionStore = {
    read: async () => {
      calls.push("session:read")
      return { kind: "success", value }
    },
    write: async (next) => {
      calls.push("session:write")
      value = next
      return { kind: "success", value: undefined }
    },
    clear: async () => {
      calls.push("session:clear")
      value = undefined
      return { kind: "success", value: undefined }
    },
  }
  return { calls, current: () => value, store }
}

const makeAuthApi = (calls: string[]): AdminCliAuthApi => ({
  login: async () => {
    calls.push("api:login")
    return {
      kind: "success",
      value: {
        status: "mfa_required",
        challengeToken: "challenge-token",
        expiresAt: "2026-06-03T11:55:00.000Z",
      },
    }
  },
  completeMfaChallenge: async () => {
    calls.push("api:mfa-challenge")
    return { kind: "success", value: session }
  },
  loadSession: async () => {
    calls.push("api:session")
    const { accessToken: _, ...loaded } = session
    return { kind: "success", value: loaded }
  },
  logout: async () => {
    calls.push("api:logout")
    return { kind: "success", value: { revoked: true } }
  },
  beginMfaEnrollment: async () => {
    calls.push("api:mfa-enroll")
    return {
      kind: "success",
      value: { secret: "BASE32SECRET", enrollmentUri: "otpauth://totp/test" },
    }
  },
  confirmMfaEnrollment: async () => {
    calls.push("api:mfa-confirm")
    return { kind: "success", value: { recoveryCodes: ["AAAA-BBBB"] } }
  },
  regenerateMfaRecoveryCodes: async () => {
    calls.push("api:mfa-recovery")
    return { kind: "success", value: { recoveryCodes: ["CCCC-DDDD"] } }
  },
  removeMfa: async () => {
    calls.push("api:mfa-remove")
    return { kind: "success", value: { updated: true } }
  },
})

const pricingCatalog = {
  serviceSlug: "wash-fold" as const,
  currency: "USD",
  updatedAt: "2026-05-22T00:00:00.000Z",
  items: [
    {
      service: "wash_fold",
      category: "Fee",
      name: "Delivery Fee",
      unit: "order",
      priceCents: 495,
      sortOrder: 1,
      metadata: {},
    },
  ],
}

const pricingPlan = {
  serviceSlug: "wash-fold" as const,
  reason: "Update tested CLI pricing",
  oldPricingSetId: "old_set",
  currency: "USD",
  changes: [
    {
      code: "delivery_fee",
      name: "Delivery Fee",
      oldPriceCents: 495,
      newPriceCents: 100,
    },
  ],
}

const published = {
  oldPricingSetId: "old_set",
  newPricingSetId: "new_set",
  auditEventId: "event_id",
  changeItemCount: 1,
}

const makePricingApi = (calls: string[]): AdminCliPricingApi => ({
  loadCatalog: async () => {
    calls.push("pricing:show")
    return { kind: "success", value: pricingCatalog }
  },
  planChange: async (_token, input) => {
    calls.push(
      `pricing:plan:${input.items.map((item) => item.priceCents).join(",")}`,
    )
    return {
      kind: "success",
      value: { ...pricingPlan, reason: input.reason },
    }
  },
  publishChange: async () => {
    calls.push("pricing:publish")
    return { kind: "success", value: published }
  },
})

describe("selected admin CLI assembly", () => {
  it("declares exactly seven auth, three pricing, and one composite bootstrap command without process imports", async () => {
    expect(Object.keys(adminCliAuthCellDeclarations)).toHaveLength(7)
    expect(Object.keys(adminCliPricingCellDeclarations)).toHaveLength(3)
    expect(Object.keys(adminCliCellDeclarations)).toHaveLength(11)
    const ids = Object.values(adminCliCellDeclarations).map((cell) => cell.id)
    expect(new Set(ids).size).toBe(11)
    expect(
      Object.values(adminCliCellDeclarations).flatMap((cell) =>
        cell.surfaces.map((surface) =>
          surface.kind === "cli" ? surface.name.join(" ") : "",
        ),
      ),
    ).toEqual([
      "auth login",
      "auth session",
      "auth logout",
      "auth mfa-enroll",
      "auth mfa-confirm",
      "auth mfa-recovery-codes",
      "auth mfa-remove",
      "pricing show",
      "pricing plan",
      "pricing publish",
      "bootstrap production",
    ])

    const operationPaths = [
      "auth-login",
      "auth-session",
      "auth-logout",
      "auth-mfa-enroll",
      "auth-mfa-confirm",
      "auth-mfa-recovery-codes",
      "auth-mfa-remove",
      "pricing-show",
      "pricing-plan",
      "pricing-publish",
      "bootstrap-production",
    ].flatMap((operation) => [
      `src/cells/cli/${operation}/cli.ts`,
      `src/cells/cli/${operation}/execute.ts`,
    ])
    const sources = await Promise.all(
      operationPaths.map((file) =>
        import("node:fs/promises").then(({ readFile }) =>
          readFile(resolve(process.cwd(), file), "utf8"),
        ),
      ),
    )
    expect(sources.join("\n")).not.toMatch(
      /(?:node:(?:fs|os|path|process)|\bprocess\.|from ['"](?:ink|react)['"])/,
    )
  })

  it("preserves exact global and namespace help bytes as immutable program data", () => {
    expect(presslyAdminCliProgram.help).toEqual({
      stdout: `${authCliUsage}\n\n${pricingCliUsage}\n`,
      exitCode: 0,
    })
    expect(presslyAdminCliProgram.groups.map((group) => group.name)).toEqual([
      ["auth"],
      ["pricing"],
    ])
    expect(presslyAdminCliProgram.unknown).toMatchObject({
      prefix: "Unknown command namespace: ",
      suffix: ".\n\n",
      token: "first",
      appendHelp: true,
    })
    expect(Object.isFrozen(presslyAdminCliProgram.groups[0]?.help)).toBe(true)
  })

  it("preserves MFA login branching from bounded stdin, last repeated email, session write order, and exact plain output", async () => {
    const calls: string[] = []
    const sessionStore = makeSessionStore(null)
    const cells = makeAdminCliAuthCells({
      api: makeAuthApi(calls),
      session: sessionStore.store,
    })
    const result = await runCell(
      cells.login,
      invocation({
        name: ["auth", "login"],
        options: {
          email: ["old@example.com", "steven@example.com"],
          "secret-stdin": true,
        },
        stdin: JSON.stringify({
          password: "password-123",
          mfaCode: "123456",
        }),
      }),
    )

    expect(result.kind).toBe("executed")
    expect(result.presentation).toEqual({
      stdout: [
        "Signed in as Steven.",
        "Identity: 00000000-0000-4000-8000-000000000001",
        "Roles: owner",
        "Expires: 2026-06-03T12:00:00.000Z",
        "",
      ].join("\n"),
      exitCode: 0,
    })
    expect(calls).toEqual(["api:login", "api:mfa-challenge"])
    expect(sessionStore.calls).toEqual(["session:write"])
    expect(sessionStore.current()).toEqual(session)
  })

  it("keeps run-time auth validation JSON-aware and parse-time conflicts plain with usage", async () => {
    const cells = makeAdminCliAuthCells({
      api: makeAuthApi([]),
      session: makeSessionStore(null).store,
    })
    const missing = await runCell(
      cells.login,
      invocation({
        name: ["auth", "login"],
        options: { "secret-stdin": true, json: true },
        stdin: JSON.stringify({ password: "password-123" }),
      }),
    )
    expect(missing.kind).toBe("executed")
    expect(missing.presentation.stderr).toBe(
      `${JSON.stringify(
        {
          ok: false,
          error: {
            code: "invalid_cli_command",
            message: "--email is required for auth login.",
          },
        },
        null,
        2,
      )}\n`,
    )

    const conflict = await runCell(
      cells.login,
      invocation({
        name: ["auth", "login"],
        options: {
          email: "steven@example.com",
          "secret-stdin": true,
          json: true,
        },
        stdin: JSON.stringify({
          password: "password-123",
          mfaCode: "123456",
          recoveryCode: "AAAA-BBBB",
        }),
      }),
    )
    expect(conflict.kind).toBe("invalid")
    expect(conflict.presentation.stderr).toBe(
      `Login standard input must be a JSON object with a password and at most one MFA or recovery code.\n\n${authCliUsage}\n`,
    )
  })

  it("preserves all seven API/session workflows and secure logout cleanup ordering", async () => {
    const apiCalls: string[] = []
    const sessionStore = makeSessionStore()
    const api = makeAuthApi(apiCalls)
    const cells = makeAdminCliAuthCells({ api, session: sessionStore.store })
    const scenarios = [
      { cell: cells.session, name: ["auth", "session"], options: {} },
      { cell: cells.mfaEnroll, name: ["auth", "mfa-enroll"], options: {} },
      {
        cell: cells.mfaConfirm,
        name: ["auth", "mfa-confirm"],
        options: { "secret-stdin": true },
        stdin: "123456\n",
      },
      {
        cell: cells.mfaRecoveryCodes,
        name: ["auth", "mfa-recovery-codes"],
        options: {},
      },
      { cell: cells.mfaRemove, name: ["auth", "mfa-remove"], options: {} },
    ] as const
    for (const scenario of scenarios)
      expect(
        (
          await runCell(
            scenario.cell,
            invocation({
              name: scenario.name,
              options: scenario.options,
              ...("stdin" in scenario ? { stdin: scenario.stdin } : {}),
            }),
          )
        ).presentation.exitCode,
      ).toBe(0)

    const logout = await runCell(
      cells.logout,
      invocation({ name: ["auth", "logout"] }),
    )
    expect(logout.presentation).toEqual({
      stdout: "Logged out.\n",
      exitCode: 0,
    })
    expect(apiCalls).toEqual([
      "api:session",
      "api:mfa-enroll",
      "api:mfa-confirm",
      "api:mfa-recovery",
      "api:mfa-remove",
      "api:logout",
    ])
    expect(sessionStore.calls).toEqual([
      "session:read",
      "session:read",
      "session:read",
      "session:read",
      "session:read",
      "session:read",
      "session:clear",
    ])

    const absent = makeSessionStore(null)
    const absentCalls: string[] = []
    const absentCells = makeAdminCliAuthCells({
      api: makeAuthApi(absentCalls),
      session: absent.store,
    })
    expect(
      (
        await runCell(
          absentCells.logout,
          invocation({ name: ["auth", "logout"] }),
        )
      ).presentation.exitCode,
    ).toBe(0)
    expect(absentCalls).toEqual([])
    expect(absent.calls).toEqual(["session:read", "session:clear"])
  })

  it("preserves pricing parsing, authenticated show, JSON output, and non-TTY publish confirmation", async () => {
    const calls: string[] = []
    const store = makeSessionStore()
    const cells = makeAdminCliPricingCells({
      api: makePricingApi(calls),
      session: store.store,
    })
    const shown = await runCell(
      cells.show,
      invocation({
        name: ["pricing", "show"],
        options: { service: "wash-fold", json: true },
      }),
    )
    expect(shown.presentation.stdout).toBe(
      `${JSON.stringify(pricingCatalog, null, 2)}\n`,
    )
    expect(store.calls).toEqual(["session:read"])

    const planned = await runCell(
      cells.plan,
      invocation({
        name: ["pricing", "plan"],
        options: {
          service: ["dry-cleaning", "wash-fold"],
          set: ["delivery_fee=$1.00", "shirt=495c"],
          reason: ["old", "Update tested CLI pricing"],
        },
      }),
    )
    expect(planned.presentation.stdout).toContain("new: $1.00")
    expect(calls).toContain("pricing:plan:100,495")

    const unconfirmed = await runCell(
      cells.publish,
      invocation({
        name: ["pricing", "publish"],
        options: {
          service: "wash-fold",
          set: "delivery_fee=1.00",
          reason: "Update tested CLI pricing",
        },
      }),
    )
    expect(unconfirmed.presentation).toEqual({
      stderr: "pricing publish requires --yes to commit.\n",
      exitCode: 1,
    })
    expect(calls).not.toContain("pricing:publish")

    const invalid = await runCell(
      cells.plan,
      invocation({
        name: ["pricing", "plan"],
        options: {
          service: "wash-fold",
          set: "delivery_fee=not-money",
          reason: "Update tested CLI pricing",
        },
      }),
    )
    expect(invalid.presentation.stderr).toBe(
      `Use a money value like 4.95, $4.95, or 495c.\n\n${pricingCliUsage}\n`,
    )
  })

  it("preserves the TTY plan-confirm-publish and cancellation state machines while JSON bypasses TTY", async () => {
    const calls: string[] = []
    const store = makeSessionStore()
    const cell = makeAdminCliPricingCells({
      api: makePricingApi(calls),
      session: store.store,
    }).publish
    const entry = defineCliCatalog([cell]).entries[0]!
    const request = invocation({
      name: ["pricing", "publish"],
      options: {
        service: "wash-fold",
        set: "delivery_fee=1.00",
        reason: "Update tested CLI pricing",
      },
    })
    const interactive = cell.surfaces[0]
    expect(interactive?.kind).toBe("cli")
    if (interactive?.kind !== "cli" || interactive.interactive === null) return
    const invoke = async (
      serialized?: unknown,
    ): Promise<CliInteractiveInvocationResult<unknown, unknown>> => {
      const decoded =
        serialized === undefined
          ? await entry.decodeInvocation(request)
          : entry.decodeInput(serialized)
      if (decoded.kind === "invalid")
        return {
          kind: "invalid",
          failure: {
            code: "input_contract_invalid",
            message: "The command input violates its contract.",
            details: { issues: decoded.issues },
          },
        }
      return { kind: "outcome", outcome: await entry.execute(decoded.value) }
    }
    const frames: CliInteractiveFrame[] = []
    const exitCode = await interactive.interactive.drive({
      invocation: request,
      invoke: invoke as never,
      session: {
        render: (frame) => {
          frames.push(frame)
        },
        readKey: async () => ({ input: "y", escape: false }),
      },
    })
    expect(exitCode).toBe(0)
    expect(calls).toEqual(["pricing:plan:100", "pricing:publish"])
    expect(store.calls).toEqual(["session:read", "session:read"])
    expect(
      frames.map((frame) => frame.lines.map((line) => line.text).join("\n")),
    ).toEqual([
      "Loading pricing...",
      expect.stringContaining("Publish this pricing change?"),
      "Publishing pricing change...",
      expect.stringContaining("Pricing change published"),
    ])
    expect(frames[1]?.lines.at(-2)).toEqual({ text: " " })
    expect(frames[1]?.lines.at(-1)).toEqual({
      text: "Publish this pricing change? Press y to publish or n to cancel.",
      tone: "warning",
    })
    expect(
      frames[1]?.lines.slice(0, -1).every((line) => line.tone === undefined),
    ).toBe(true)
    expect(
      interactive.interactive.when(
        invocation({
          name: ["pricing", "publish"],
          options: { ...request.options, json: true },
        }),
      ),
    ).toBe(false)

    const cancelCalls: string[] = []
    const cancelCell = makeAdminCliPricingCells({
      api: makePricingApi(cancelCalls),
      session: makeSessionStore().store,
    }).publish
    const cancelEntry = defineCliCatalog([cancelCell]).entries[0]!
    const cancelSurface = cancelCell.surfaces[0]
    expect(cancelSurface?.kind).toBe("cli")
    if (cancelSurface?.kind !== "cli" || cancelSurface.interactive === null)
      return
    const cancelled = await cancelSurface.interactive.drive({
      invocation: request,
      invoke: (async (serialized: unknown) => {
        const decoded =
          serialized === undefined
            ? await cancelEntry.decodeInvocation(request)
            : cancelEntry.decodeInput(serialized)
        if (decoded.kind === "invalid")
          return {
            kind: "invalid",
            failure: {
              code: "input_contract_invalid",
              message: "invalid",
              details: { issues: decoded.issues },
            },
          }
        return {
          kind: "outcome",
          outcome: await cancelEntry.execute(decoded.value),
        }
      }) as never,
      session: {
        render: () => undefined,
        readKey: async () => ({ input: "n", escape: false }),
      },
    })
    expect(cancelled).toBe(1)
    expect(cancelCalls).toEqual(["pricing:plan:100"])
  })

  it("preserves production preview-preview/apply-apply order and 0/2 JSON exits", async () => {
    const calls: string[] = []
    const authority = (
      name: string,
      dryRun: boolean,
      status: "converged" | "rejected" = "converged",
    ): BootstrapAuthorityResult => ({
      status,
      mode: dryRun ? "dry_run" : "apply",
      applied: !dryRun && status === "converged",
      operations: [],
      rejections: [],
      name,
    })
    const cell = makeAdminCliProductionBootstrapCell({
      runExclusive: (work) => work(),
      prepare: async (file) => {
        calls.push(`prepare:${file}`)
        return {
          kind: "success",
          value: {
            manageLocation: async ({ dryRun }) => {
              calls.push(`location:${dryRun ? "preview" : "apply"}`)
              return {
                kind: "success",
                value: authority("location", dryRun),
              }
            },
            manageProduction: async ({ dryRun }) => {
              calls.push(`production:${dryRun ? "preview" : "apply"}`)
              return {
                kind: "success",
                value: authority("production", dryRun),
              }
            },
            manageSourceLocationBindings: async ({ dryRun }) => {
              calls.push(`bindings:${dryRun ? "preview" : "apply"}`)
              return {
                kind: "success",
                value: authority("bindings", dryRun),
              }
            },
          },
        }
      },
    })
    const applied = await runCell(
      cell,
      invocation({
        name: ["bootstrap", "production"],
        options: {
          file: "/tmp/manifest.json",
          "actor-id": "11111111-1111-4111-8111-111111111111",
          "idempotency-key": "bootstrap-test-1",
          apply: true,
        },
      }),
    )
    expect(applied.presentation.exitCode).toBe(0)
    expect(JSON.parse(applied.presentation.stdout ?? "")).toMatchObject({
      location: { mode: "apply", applied: true },
      production: { mode: "apply", applied: true },
      sourceLocationBindings: { mode: "apply", applied: true },
    })
    expect(calls).toEqual([
      "prepare:/tmp/manifest.json",
      "location:preview",
      "production:preview",
      "bindings:preview",
      "location:apply",
      "production:apply",
      "bindings:apply",
    ])

    const rejectedCell = makeAdminCliProductionBootstrapCell({
      runExclusive: (work) => work(),
      prepare: async () => ({
        kind: "success",
        value: {
          manageLocation: async () => ({
            kind: "success",
            value: authority("location", true),
          }),
          manageProduction: async () => ({
            kind: "success",
            value: authority("production", true),
          }),
          manageSourceLocationBindings: async () => ({
            kind: "success",
            value: authority("bindings", true, "rejected"),
          }),
        },
      }),
    })
    const rejected = await runCell(
      rejectedCell,
      invocation({
        name: ["bootstrap", "production"],
        options: {
          file: "/tmp/manifest.json",
          "actor-id": "11111111-1111-4111-8111-111111111111",
          "idempotency-key": "bootstrap-test-1",
          apply: true,
        },
      }),
    )
    expect(rejected.presentation.exitCode).toBe(2)
  })

  it("assembles every selected operation from lazy owner capabilities without invoking them", () => {
    const prepare = vi.fn()
    const apiCalls: string[] = []
    const store = makeSessionStore()
    const experience = makeAdminCliExperience({
      auth: { api: makeAuthApi(apiCalls), session: store.store },
      pricing: { api: makePricingApi(apiCalls), session: store.store },
      productionBootstrap: { prepare, runExclusive: (work) => work() },
    })
    expect(Object.keys(experience.cells)).toHaveLength(11)
    const catalog = defineCliCatalog(
      Object.values(experience.cells),
      presslyAdminCliProgram,
    )
    expect(catalog.entries).toHaveLength(11)
    expect(catalog.program?.id).toBe("control.pressly-admin-cli.v1")
    expect(prepare).not.toHaveBeenCalled()
    expect(apiCalls).toEqual([])
    expect(store.calls).toEqual([])
  })
})
