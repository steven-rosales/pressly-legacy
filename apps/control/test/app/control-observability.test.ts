import { beforeEach, describe, expect, it, vi } from "vitest"

const sentry = vi.hoisted(() => ({
  browserTracingIntegration: vi.fn(() => ({ name: "browser-tracing" })),
  captureException: vi.fn(),
  init: vi.fn(),
  scope: {
    setContext: vi.fn(),
    setTag: vi.fn(),
  },
  withScope: vi.fn(),
}))

vi.mock("@sentry/react", () => ({
  browserTracingIntegration: sentry.browserTracingIntegration,
  captureException: sentry.captureException,
  init: sentry.init,
  withScope: sentry.withScope,
}))

import {
  initializeControlObservability,
  observeControlUnexpectedError,
} from "@/app/control-observability"

describe("Control observability", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sentry.withScope.mockImplementation((callback) => callback(sentry.scope))
  })

  it("preserves the existing browser reporter when the DSN is absent", () => {
    const reportError = vi.fn()
    vi.stubGlobal("reportError", reportError)

    expect(
      initializeControlObservability({
        environment: "test",
        release: "git-sha",
      }),
    ).toBe(false)

    const failure = new Error("render failed")
    observeControlUnexpectedError(
      failure,
      { componentStack: "ControlApp" },
      false,
    )

    expect(sentry.init).not.toHaveBeenCalled()
    expect(sentry.captureException).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledWith(failure)

    vi.unstubAllGlobals()
  })

  it("initializes global handlers and traces without sending browser PII", () => {
    expect(
      initializeControlObservability({
        dsn: "https://public@example.test/1",
        environment: "production",
        release: "git-sha",
        tracesSampleRate: "0.2",
      }),
    ).toBe(true)

    const options = sentry.init.mock.calls[0]![0]
    expect(options).toMatchObject({
      environment: "production",
      release: "git-sha",
      sendDefaultPii: false,
      tracesSampleRate: 0.2,
      initialScope: { tags: { application: "pressly-control" } },
    })
    const defaultGlobalHandler = { name: "global-handlers" }
    expect(options.integrations([defaultGlobalHandler])).toEqual([
      defaultGlobalHandler,
      { name: "browser-tracing" },
    ])
    expect(
      options.beforeSend({
        user: { email: "owner@example.test" },
        request: {
          url: "https://control.test/team/invitations?token=private#private",
          method: "GET",
          headers: { Cookie: "session=private" },
          data: { password: "private" },
        },
      }),
    ).toEqual({
      user: undefined,
      request: {
        url: "https://control.test/team/invitations",
        method: "GET",
      },
    })
    expect(
      options.beforeBreadcrumb({
        category: "navigation",
        data: {
          from: "https://control.test/#invite=private",
          to: "https://control.test/team?email=private",
        },
      }),
    ).toEqual({
      category: "navigation",
      data: {
        from: "https://control.test/",
        to: "https://control.test/team",
      },
    })
    expect(
      options.beforeBreadcrumb({ category: "console", message: "private" }),
    ).toBeNull()
    expect(
      options.beforeSendSpan({
        data: {
          "http.request.method": "GET",
          "url.full": "https://control.test/api/team?email=private",
          "url.fragment": "invite=private",
          "url.query": "email=private",
        },
        description: "GET /api/team?email=private",
        span_id: "span-id",
        start_timestamp: 1,
        trace_id: "trace-id",
      }),
    ).toEqual({
      data: {
        "http.request.method": "GET",
        "url.full": "https://control.test/api/team",
      },
      description: "GET /api/team",
      span_id: "span-id",
      start_timestamp: 1,
      trace_id: "trace-id",
    })
    expect(
      options.beforeSendTransaction({
        type: "transaction",
        transaction: "/team?email=private",
        request: {
          url: "https://control.test/team?email=private#private",
          method: "GET",
          data: { token: "private" },
        },
        user: { email: "owner@example.test" },
        spans: [
          {
            data: { "http.target": "/api/team?email=private" },
            description: "GET /api/team?email=private",
            span_id: "span-id",
            start_timestamp: 1,
            trace_id: "trace-id",
          },
        ],
      }),
    ).toEqual({
      type: "transaction",
      transaction: "/team",
      request: {
        url: "https://control.test/team",
        method: "GET",
      },
      user: undefined,
      spans: [
        {
          data: { "http.target": "http://localhost:3000/api/team" },
          description: "GET /api/team",
          span_id: "span-id",
          start_timestamp: 1,
          trace_id: "trace-id",
        },
      ],
    })
  })

  it("captures root render failures once with bounded component context", () => {
    const failure = new Error("render failed")
    observeControlUnexpectedError(
      failure,
      { componentStack: "ControlApp" },
      true,
    )

    expect(sentry.scope.setTag).toHaveBeenCalledWith(
      "error.boundary",
      "control-root",
    )
    expect(sentry.scope.setContext).toHaveBeenCalledWith("react", {
      component_stack: "ControlApp",
    })
    expect(sentry.captureException).toHaveBeenCalledWith(failure)
  })
})
