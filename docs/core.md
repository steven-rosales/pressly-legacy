# Frontend Effects

Frontend runtime code lives in:

```txt
apps/web/src/common/
  core/
  adapters/
  config/
```

## Core

Core defines the frontend effect language. The current `WebCorePorts` are:

- `Clock`
- `ContextProvider<WebContext>`
- `Logger`
- `AnalyticsTracker`
- `ErrorReporter`
- `RequestClient`

`createWebCore` combines those ports with one interpreter: `QueryRuntime`.

Core should not import:

- PostHog
- Sentry
- Sonner
- Next.js
- React
- browser globals directly

Core is vocabulary and runtime policy, not vendor or framework implementation.

## Adapters

Adapters implement effects. They may import:

- `posthog-js`
- `@sentry/nextjs`
- `sonner`
- `fetch`
- `next/navigation`
- React context

Adapters translate framework and vendor mechanisms into core ports or compose
those ports for a runtime.

## Runtime Composition

The browser runtime is composed in
`apps/web/src/common/adapters/runtime/web-core-context.tsx`.

`WebCoreProvider` injects:

- logger
- analytics tracker
- error reporter
- request client
- browser context
- clock

Components access the composed runtime through `useWebCore`.

The server runtime is composed separately in
`apps/web/src/common/adapters/runtime/server-web-core.ts`. Server composition
uses server-safe context and request adapters and does not initialize browser
analytics.

## Query Runtime

`QueryRuntime` has two narrow operations:

```ts
query.run({ meta, work });
query.fetch({ meta, request });
```

Both return `Promise<Result<A, AppError>>`.

- `run` executes an asynchronous read, normalizes thrown values, and records
  success or failure.
- `fetch` delegates protocol IO to `RequestClient`, preserves its typed result,
  and records success or failure.
- Action metadata, context, clock, logging, and error reporting stay in the
  interpreter rather than product code.

There is no generic write interpreter. Product or server actions should remain
explicit until repeated write behavior justifies another narrow runtime.

## Analytics

Core owns only the narrow tracking function:

```ts
type TrackPublicEvent = (event: ProductEvent) => void;
```

`trackPublicEvent(core)` enriches an event with route, session, and distinct-id
context before delegating to the injected analytics tracker.

Event definitions belong to the product capability that understands them:

```txt
features/order-entry/events.ts
features/pricing/events.ts
app/(marketing)/commercial/events.ts
app/(marketing)/contact/events.ts
```

Do not create a global event registry. Keep names, versions, and properties
beside their owning feature or bounded route.

Rules:

- Use stable event names.
- Include schema versions through `defineEvent`.
- Keep fields low-cardinality.
- Do not send accidental PII.
- Do not send emails, phone numbers, full addresses, raw search text, or raw
  user content.
- Components should not call `posthog.capture` directly.

Preferred:

```tsx
<TrackedAnchor
  href={vendorUrl}
  event={orderEntryEvents.intentStarted({
    source: 'hero',
    vendor: 'cents',
  })}
>
  Schedule a Pickup
</TrackedAnchor>
```

Avoid:

```tsx
posthog.capture('order_intent_started');
```

## UI Feedback

`SonnerToaster` is an app-shell presentation adapter mounted by
`app/layout.tsx`. It is not injected into `WebCore`, and query execution does
not automatically produce toast messages.

When a product workflow needs intentional feedback, keep the message and
decision at the feature or UI boundary while keeping the Sonner import in an
adapter.

## Requests

Application API calls should go through `RequestClient`.

The request client returns `Result<A, AppError>` and validates API responses
against Zod schemas. Components should not call `fetch` directly for
application protocols.

Allowed exceptions:

- Next.js metadata or static asset fetching
- one-off framework integrations
- route handlers or server actions that deliberately define a new protocol
  boundary
