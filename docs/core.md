# Effects

Frontend runtime lives in:

```txt
apps/web/src/common/
  core/
  adpaters/
  config/
```

## Core

Core defines the frontend effect language.

Core may define:

- Clock
- ContextProvider
- WebContext
- FeedbackPort
- RequestClient
- CommandRunner
- QueryRunner
- Product even helpers
- Analytics tracking helpers

Core should not import:

- PostHog
- Sentry
- Sonner
- Next router
- React hooks
- Browser globals directly

Core is vocabulary, not vendor implementation.

## Adpaters

Adapters implement effects.

Adapaters may import:

- posthog-js
- @sentry/nextjs
- sonner
- fetch
- next/navigation
- React context

Adapters translate framework/vendor mechanisms into core ports.

## Runtime Composition

The browser runtime is componse in `apps/web/src/common/adapters/runtime/web-core-context.tsx`.

This provider creates the WebCore object and injects:

- logger
- analytics tracker
- error reporter
- feedback adapter
- request client
- browser context
- clock

Components should use the composed core through `useWebCore`.

## Analytics

Product anaytics events are typed and names in: `apps/web/src/common/core/analytics/events.ts`.

Rules:

- Use stable event names.
- Include schema versions.
- Keep fields low-cardinality.
- Do not send accidental PII.
- Do not send emails, phone numbers, full addresses, raw search text, or raw user content.
- Components should not call `posthog.capture` directly.

Preferred:

```tsx
<TrackedAnchor
  href={vendorUrl}
  event={publicEvents.externalOrderStarted({ source: 'hero', vendor: 'cents' })}
>
  Schedule a Pickup
</TrackedAnchor>
```

Avoid:

```tsx
posthog.capture('external_order_started');
```

## Feedback

Components should not call `toast.*` directly.

Use command runners for operation feedback, or a feedback port thorugh core for intentional UI feedback.

Preferred:

```ts
const runCommand = makeCommandRunner(core);

await runCommand(
  {
    action: 'submit_contact_form',
    rail: 'command',
    criticality: 'medium',
    source: 'contact_page',
  },
  submit as <A>(body: A) => Promise<unknown>,
  {
    loading: 'Sending message...',
    success: 'Message sent...',
    error: 'Message could not be sent',
  },
);
```

## Requests

API calls should go through the request client.

The request client returns `Result<A, AppError>` and validates API responses against Zod schemas.

Components should not call fetch directly for application API protocols.

Allowed exceptions:

- Next metadata/static asset fetching
- One-off framework integrations
- Route handlers or server actions that deliberately define a new protocol boundary
