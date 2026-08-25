import { expect } from "vitest"
import {
  makeProcessorExperience,
  type OperationalOrderCanonical,
  type OperationalOrderReference,
} from "../../src/server.ts"
import {
  historyActivityFixture,
  historyRunFixture,
  orderBacklogPreviewFixture,
  orderControlFixture,
  productionBoardFixture,
  productionWorkspaceFixture,
  remainingDayForecastFixture,
  serverFixtureIds as ids,
  serverFixtureLocationId as locationId,
  serverFixtureNow,
} from "../server/fixtures.ts"

const identityId = "11111111-1111-4111-8111-111111111111"
const sessionId = "22222222-2222-4222-8222-222222222222"
const expiresAt = new Date("2026-08-23T20:00:00.000Z")
const success = <Value>(value: Value) => ({ kind: "success" as const, value })
const upstreamFailure = () =>
  Object.freeze({
    kind: "failure" as const,
    failure: Object.freeze({
      tag: "ProductionFailure" as const,
      kind: "future_upstream_kind",
      code: "future_upstream_code",
      message: "A future Production diagnostic was preserved.",
      safeMessage: "The request could not be completed.",
    }),
  })
const queryOutcome = <Value>(value: Value, failing: boolean) =>
  failing ? upstreamFailure() : success(value)
type ProcessorAuthFailureKind =
  | "authentication"
  | "conflict"
  | "permission"
  | "rate_limit"
const accessFailure = (kind: Exclude<ProcessorAuthFailureKind, "permission">) =>
  Object.freeze({
    kind: "failure" as const,
    failure: Object.freeze({
      kind,
      code: `future_${kind}_code`,
      message: `A future ${kind} diagnostic was preserved.`,
    }),
  })
const authOutcome = <Value>(
  value: Value,
  failureKind: ProcessorAuthFailureKind | undefined
) =>
  failureKind === undefined || failureKind === "permission"
    ? success(value)
    : accessFailure(failureKind)

const canonical = (): OperationalOrderCanonical => ({
  canonicalOrderId: ids.canonicalOrder,
  canonicalFulfillmentId: ids.fulfillment,
  displayNumber: null,
  customer: {
    resolution: "resolved",
    userId: null,
    firstName: "Casey",
    lastName: "Operator",
    businessName: null,
    phone: null,
  },
  commercialState: "open",
  admissionState: "released",
  versions: { order: 2, fulfillment: 3 },
})

const loadedSession = {
  principal: {
    identityId,
    kind: "human" as const,
    displayName: "Operator",
    email: "operator@example.com",
    sessionId,
    sessionIssuedAt: new Date(serverFixtureNow),
    sessionExpiresAt: expiresAt,
  },
  principalAttributes: {
    assignments: [],
    identityActive: true,
    assuranceLevel: "mfa" as const,
  },
}

const makeTarget = (
  failing = false,
  authFailureKind?: ProcessorAuthFailureKind
) =>
  makeProcessorExperience({
    production: {
      loadBoard: async () => queryOutcome(productionBoardFixture(), failing),
      previewOrderBacklog: async () =>
        queryOutcome(orderBacklogPreviewFixture(), failing),
      loadWorkspace: async () =>
        queryOutcome(productionWorkspaceFixture(), failing),
      loadRemainingDayForecast: async () =>
        queryOutcome(remainingDayForecastFixture(), failing),
      listHistoryActivity: async () =>
        queryOutcome(historyActivityFixture(), failing),
      loadHistoryRun: async () => queryOutcome(historyRunFixture(), failing),
      listOrderControl: async () =>
        queryOutcome(orderControlFixture(), failing),
    },
    resolveOrderCanonical: async (
      references: readonly OperationalOrderReference[]
    ) =>
      new Map(
        references.map((reference) => [
          reference.referenceId,
          reference.productionOrderId === null ? null : canonical(),
        ])
      ),
    loadOrderAudit: async () => ({
      sources: [
        {
          canonicalOrderId: ids.canonicalOrder,
          name: "cents",
          observedAt: new Date("2026-08-22T15:00:00.000Z"),
        },
      ],
      orderCommands: [],
      productionCommands: [],
    }),
    login: {
      execute: async () =>
        authOutcome(
          { accessToken: "session-token", expiresAt },
          authFailureKind
        ),
    },
    completeMfaChallenge: {
      execute: async () =>
        authOutcome(
          { accessToken: "session-token", expiresAt },
          authFailureKind
        ),
    },
    loadSession: {
      execute: async () => authOutcome(loadedSession, authFailureKind),
    },
    revokeSession: {
      execute: async () =>
        authOutcome({ revoked: true as const }, authFailureKind),
    },
    listActiveProductionLocations: {
      execute: async () =>
        success({
          locations:
            authFailureKind === "permission"
              ? []
              : [
                  {
                    id: locationId,
                    businessId: "33333333-3333-4333-8333-333333333333",
                    name: "Processor Facility",
                    timezone: "America/New_York",
                  },
                ],
        }),
    },
    resolveProductionCapabilities: () => ["production:read"],
    clock: { now: () => new Date(serverFixtureNow) },
    origins: {
      processor: "https://processor.pressly.test",
      control: "https://control.pressly.test",
    },
    presentation: {
      deriveCsrfToken: () => "a".repeat(43),
      serializeCookies: () => [],
    },
  } as never)

const execution = (
  operationId: string,
  failing = false,
  authFailureKind?: ProcessorAuthFailureKind
) => {
  const cells = makeTarget(failing, authFailureKind).cells
  const executions: Readonly<Record<string, () => Promise<unknown>>> = {
    "processor.auth-login.v1": () =>
      cells.login.execute({
        email: "operator@example.com",
        password: "correct-horse-battery-staple",
      }),
    "processor.complete-mfa-challenge.v1": () =>
      cells.completeMfaChallenge.execute({
        challengeToken: "challenge-token",
        method: "totp",
        code: "123456",
      }),
    "processor.load-auth-session.v1": () =>
      cells.loadSession.execute({ sessionToken: "session-token" }),
    "processor.logout.v1": () =>
      cells.logout.execute({ sessionToken: "session-token" }),
    "processor.resolve-access.v1": () =>
      cells.resolveAccess.execute(loadedSession),
    "processor.load-production-board.v1": () =>
      cells.loadBoard.execute({
        locationId,
        productionRunId: ids.run,
      }),
    "processor.preview-production-order-backlog.v1": () =>
      cells.previewOrderBacklog.execute({
        locationId,
        filter: "all_due_before_cutoff",
        cutoff: "2026-08-01T00:00:00.000Z",
        reason: "processor_not_in_use",
        cursor: null,
        maxOrders: 250,
      }),
    "processor.load-production-workspace.v1": () =>
      cells.loadWorkspace.execute({ locationId }),
    "processor.load-remaining-day-forecast.v1": () =>
      cells.loadRemainingDayForecast.execute({
        locationId,
        serviceDay: "2026-08-22",
      }),
    "processor.list-production-history-activity.v1": () =>
      cells.listHistoryActivity.execute({ locationId, limit: 50 }),
    "processor.load-production-history-run.v1": () =>
      cells.loadHistoryRun.execute({
        locationId,
        productionRunId: ids.run,
      }),
    "processor.list-production-order-control.v1": () =>
      cells.listOrderControl.execute({
        locationId,
        view: "all",
        limit: 25,
      }),
  }
  return executions[operationId]?.()
}

export const expectProcessorOperationSuccess = async (
  operationId: string
): Promise<void> => {
  const outcomePromise = execution(operationId)
  expect(
    outcomePromise,
    `No execution fixture for ${operationId}`
  ).toBeDefined()
  const outcome = await outcomePromise
  expect(outcome).toMatchObject({ kind: "success" })
}

export const expectProcessorProductionQueryFailure = async (
  operationId: string,
  expectedReason: "upstream_production_query_failed"
): Promise<void> => {
  const outcomePromise = execution(operationId, true)
  expect(
    outcomePromise,
    `No failure execution fixture for ${operationId}`
  ).toBeDefined()
  await expect(outcomePromise).resolves.toEqual({
    kind: "failure",
    failure: {
      ...upstreamFailure().failure,
      reason: expectedReason,
    },
  })
}

export const expectProcessorAuthenticationFailure = async (
  operationId: string,
  expectedKind: ProcessorAuthFailureKind
): Promise<void> => {
  const outcomePromise = execution(operationId, false, expectedKind)
  expect(
    outcomePromise,
    `No authentication failure fixture for ${operationId}`
  ).toBeDefined()
  await expect(outcomePromise).resolves.toMatchObject({
    kind: "failure",
    failure: {
      kind: expectedKind,
      code:
        expectedKind === "permission"
          ? "processor_access_unavailable"
          : `future_${expectedKind}_code`,
    },
  })
}
