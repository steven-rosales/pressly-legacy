import * as Sentry from "@sentry/react"

export type ControlObservabilityConfig = Readonly<{
  dsn?: string
  environment: string
  release?: string
  tracesSampleRate?: string
}>

export type ControlUnexpectedErrorContext = Readonly<{
  componentStack: string
}>

type ControlSentryOptions = Parameters<typeof Sentry.init>[0]
type ControlSentrySpan = Parameters<
  NonNullable<ControlSentryOptions["beforeSendSpan"]>
>[0]

const safeSampleRate = (raw: string | undefined): number => {
  if (raw === undefined) return 0.1
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.1
}

const withoutQueryOrFragment = (value: string): string => {
  try {
    const url = new URL(value, window.location.origin)

    return `${url.origin}${url.pathname}`
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value
  }
}

const withoutQueryOrFragmentText = (value: string): string =>
  value.split(/[?#]/, 1)[0] ?? value

const scrubSpan = (span: ControlSentrySpan): ControlSentrySpan => ({
  ...span,
  ...(span.description === undefined
    ? {}
    : { description: withoutQueryOrFragmentText(span.description) }),
  data: Object.fromEntries(
    Object.entries(span.data).flatMap(([key, value]) => {
      if (/(?:^|[._])(?:fragment|query)(?:$|[._])/i.test(key)) return []

      return [
        [
          key,
          typeof value === "string" &&
          /(?:^|[._])(?:target|url)(?:$|[._])/i.test(key)
            ? withoutQueryOrFragment(value)
            : value,
        ],
      ]
    }),
  ),
})

const scrubBreadcrumb = (
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null => {
  if (breadcrumb.category === "console") return null

  if (breadcrumb.data === undefined) return breadcrumb

  if (breadcrumb.category === "navigation") {
    const from = breadcrumb.data["from"]
    const to = breadcrumb.data["to"]
    return {
      ...breadcrumb,
      data: {
        ...(typeof from === "string"
          ? { from: withoutQueryOrFragment(from) }
          : {}),
        ...(typeof to === "string" ? { to: withoutQueryOrFragment(to) } : {}),
      },
    }
  }

  if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") {
    const url = breadcrumb.data["url"]
    const method = breadcrumb.data["method"]
    const statusCode = breadcrumb.data["status_code"]
    return {
      ...breadcrumb,
      data: {
        ...(typeof method === "string" ? { method } : {}),
        ...(typeof statusCode === "number" ? { status_code: statusCode } : {}),
        ...(typeof url === "string"
          ? { url: withoutQueryOrFragment(url) }
          : {}),
      },
    }
  }

  return breadcrumb
}

export const initializeControlObservability = (
  config: ControlObservabilityConfig,
): boolean => {
  if (config.dsn === undefined || config.dsn.trim().length === 0) return false

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    ...(config.release === undefined || config.release.length === 0
      ? {}
      : { release: config.release }),
    integrations: (defaultIntegrations) => [
      ...defaultIntegrations,
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: safeSampleRate(config.tracesSampleRate),
    enableLogs: false,
    sendDefaultPii: false,
    initialScope: { tags: { application: "pressly-control" } },
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: (event) => ({
      ...event,
      user: undefined,
      ...(event.request === undefined
        ? {}
        : {
            request: {
              ...(event.request.method === undefined
                ? {}
                : { method: event.request.method }),
              ...(event.request.url === undefined
                ? {}
                : { url: withoutQueryOrFragment(event.request.url) }),
            },
          }),
    }),
    beforeSendSpan: scrubSpan,
    beforeSendTransaction: (event) => ({
      ...event,
      user: undefined,
      ...(event.transaction === undefined
        ? {}
        : { transaction: withoutQueryOrFragmentText(event.transaction) }),
      ...(event.request === undefined
        ? {}
        : {
            request: {
              ...(event.request.method === undefined
                ? {}
                : { method: event.request.method }),
              ...(event.request.url === undefined
                ? {}
                : { url: withoutQueryOrFragment(event.request.url) }),
            },
          }),
      ...(event.spans === undefined
        ? {}
        : { spans: event.spans.map(scrubSpan) }),
    }),
  })
  return true
}

export const observeControlUnexpectedError = (
  error: Error,
  context: ControlUnexpectedErrorContext,
  sentryEnabled: boolean,
): void => {
  if (!sentryEnabled) {
    globalThis.reportError?.(error)
    return
  }

  Sentry.withScope((scope) => {
    scope.setTag("error.boundary", "control-root")
    scope.setContext("react", {
      component_stack: context.componentStack.slice(0, 4_000),
    })
    Sentry.captureException(error)
  })
}
