import { beforeEach, describe, expect, it, vi } from "vitest"
import { RequestFailure } from "@/ports/request.error"

const sentry = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: "browser-tracing" })),
  captureException: vi.fn(),
  init: vi.fn(),
  scope: {
    setContext: vi.fn(),
    setLevel: vi.fn(),
    setTag: vi.fn(),
  },
  withScope: vi.fn(),
}))

vi.mock("@sentry/react", () => ({
  addBreadcrumb: sentry.addBreadcrumb,
  browserTracingIntegration: sentry.browserTracingIntegration,
  captureException: sentry.captureException,
  init: sentry.init,
  withScope: sentry.withScope,
}))

import {
  initializeProcessorObservability,
  observeProcessorRequestFailure,
} from "@/app/processor-observability"

describe("Processor observability", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sentry.withScope.mockImplementation((callback) => callback(sentry.scope))
  })

  it("stays disabled without a browser DSN", () => {
    expect(
      initializeProcessorObservability({
        environment: "test",
        release: "git-sha",
      })
    ).toBe(false)
    expect(sentry.init).not.toHaveBeenCalled()
  })

  it("initializes without PII and strips request and breadcrumb queries", () => {
    expect(
      initializeProcessorObservability({
        dsn: "https://public@example.test/1",
        environment: "production",
        release: "git-sha",
        tracesSampleRate: "0.2",
      })
    ).toBe(true)

    const options = sentry.init.mock.calls[0]![0]
    expect(options).toMatchObject({
      environment: "production",
      release: "git-sha",
      sendDefaultPii: false,
      tracesSampleRate: 0.2,
    })
    expect(
      options.beforeSend({
        user: { email: "operator@example.test" },
        request: {
          url: "https://processor.test/production/run?secret=value",
          method: "GET",
          headers: { Cookie: "session=private" },
          data: { password: "private" },
        },
      })
    ).toEqual({
      user: undefined,
      request: {
        url: "https://processor.test/production/run",
        method: "GET",
      },
    })
    expect(
      options.beforeBreadcrumb({
        category: "fetch",
        data: {
          method: "GET",
          status_code: 200,
          url: "https://processor.test/api/orders?cursor=private",
          request_body: "private",
        },
      })
    ).toEqual({
      category: "fetch",
      data: {
        method: "GET",
        status_code: 200,
        url: "https://processor.test/api/orders",
      },
    })
    expect(
      options.beforeBreadcrumb({ category: "console", message: "private" })
    ).toBeNull()
  })

  it("records expected failures as breadcrumbs and captures actionable failures", () => {
    observeProcessorRequestFailure(
      new RequestFailure({
        kind: "conflict",
        code: "STALE_VERSION",
        message: "Refresh required.",
        status: 409,
      }),
      {
        method: "PATCH",
        path: "/production/runs/00000000-0000-4000-8000-000000000001",
      }
    )
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "PATCH /production/runs/:id failed",
      })
    )
    expect(sentry.captureException).not.toHaveBeenCalled()

    const failure = new RequestFailure({
      kind: "invalid_response",
      code: "INVALID_API_RESPONSE",
      message: "Unreadable response.",
      status: 500,
      requestId: "request-7",
    })
    observeProcessorRequestFailure(failure, {
      method: "GET",
      path: "/production/workspace?cursor=private",
    })
    expect(sentry.scope.setTag).toHaveBeenCalledWith(
      "failure.code",
      "INVALID_API_RESPONSE"
    )
    expect(sentry.scope.setContext).toHaveBeenCalledWith("request_reference", {
      request_id: "request-7",
      trace_id: null,
    })
    expect(sentry.captureException).toHaveBeenCalledWith(failure)
  })
})
