# Application Controls

This document describes application-level controls against malicious or malformed input.

It does not replace the dedicated authentication, authorization, secrets,
infrastructure, or incident-response references. It does document the browser
session and CSRF boundary where those concerns determine request safety.

## Control Status

| Control                   | Status                      | Enforcement point                          |
| ------------------------- | --------------------------- | ------------------------------------------ |
| CORS                      | Active                      | API middleware                             |
| Browser security headers  | Active                      | API Helmet middleware and web CSP          |
| HTML sanitization         | Available, unused           | Feature boundary when rich HTML is added   |
| SSRF protection           | Not triggered               | Add before user-directed outbound requests |
| CSRF protection           | Active for browser sessions | Processor and Control browser boundaries   |
| Request validation        | Active                      | HTTP adapters and API body parsers         |
| SQL injection prevention  | Active                      | `@pressly/db` query boundary and CI        |
| Rate limiting             | Active                      | API ingress                                |
| Safe errors and telemetry | Active                      | API error boundary and security event sink |

"Not triggered" means the vulnerable capability does not exist today.
It does not mean that an empty middleware file protects the application.

## Ownership

Controls live at the narrowest boundary that can enforce them consistently:

| Boundary             | Responsibility                                                           |
| -------------------- | ------------------------------------------------------------------------ |
| `apps/api`           | Ingress composition, browser protocol policy, limits, and error handling |
| `apps/web`           | Browser execution policy and safe rendering                              |
| `packages/http`      | Reusable HTTP parsing and response mechanics                             |
| `packages/contracts` | Runtime schemas for cross-boundary payloads                              |
| `packages/db`        | Parameterized query surface and database-role verification               |
| Feature HTTP adapter | Applies the schema and maps validated input into a use case              |

Business use cases should not parse Express requests or implement browser protocols.
The API composition root should not own feature-specific validation rules.

## CORS

### Purpose

Cross-Origin Resource Sharing (CORS) is a browser-enforced protocol that selectively relaxes the same-origin policy.

An origin is:

```text
scheme + hostname + port
```

For example, `http://localhost:3000` and `http://localhost:4000` are different origins.
Paths such as `/pricing` are not part of an origin.

CORS is not authentication, authorization, CSRF protection, or a firewall.
Non-browser clients such as `curl` and malicious servers do not have to enforce it.

### Implementation

The API policy lives in
`apps/api/src/http/middleware/cors.middleware.ts` and is composed before routes
in `apps/api/src/bootstrap/api.composition.ts`.

The policy:

- Compares browser origins against an exact allowlist.
- Allows requests without an `Origin` header because CLI and server clients are not governed by browser CORS.
- Allows only `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, and `OPTIONS`.
- Allows only the declared request headers, including Pressly's route and session headers.
- Returns `204` for successful preflight requests.
- Allows browsers to cache preflight results for 600 seconds.
- Does not enable credentialed cross-origin cookies.

Configuration is validated before the middleware is created.

Production rejects:

- An empty origin allowlist.
- Non-HTTPS origins.
- Origins containing credentials, paths, queries, or fragments.
- Values that are not valid HTTP or HTTPS URLs.

The `cors` package performs the HTTP protocol mechanics.
Pressly code owns the policy decision: which origins, methods, and headers are allowed.

## Browser Security Headers

The API applies `helmet()` before all routes from
`apps/api/src/bootstrap/api.composition.ts`.
It removes the Express disclosure header and adds baseline browser defenses such as content-type sniffing protection, frame restrictions, transport security, and referrer policy.

The web application owns the meaningful browser execution policy because it serves executable pages.
The API serves JSON, so its Helmet policy is defense in depth rather than the primary XSS boundary.

Do not disable a header globally to fix one integration.
First narrow the exception to the directive, origin, and route that require it.

## XSS: CSP and HTML Sanitization

### Purpose

Cross-Site Scripting (XSS) occurs when attacker-controlled content is interpreted as executable browser code inside a trusted page.

Pressly uses layered controls because no single control covers every injection path:

```text
Escape ordinary text
  -> sanitize intentionally supported rich HTML
  -> restrict browser execution with CSP
```

### React Rendering

React escapes ordinary string values rendered through JSX.
Application code should continue rendering user-controlled text as text, not through `dangerouslySetInnerHTML`.

The current JSON-LD component is the deliberate exception.
It serializes structured data and escapes `<` before writing the script body.

### HTML Sanitizer

**Current status:** Pressly does not accept or render user-controlled rich HTML,
so the API has no dormant global sanitizer.

When a feature introduces rich HTML, its adapter must add an explicit sanitizer
at that feature's trust boundary and store or render only the sanitized result.
Do not apply HTML sanitization indiscriminately to ordinary JSON or plain text.

### Content Security Policy

The active CSP builder lives in `apps/web/src/common/security/content-security-policy.ts`.
Next.js attaches the resulting `Content-Security-Policy` header to every web response through `apps/web/next.config.ts`.

The policy restricts:

- Scripts to the Pressly origin and PostHog's required asset origin.
- Browser connections to Pressly, the configured API, PostHog, and optional Sentry origins.
- Frames to the Cents scheduling origin.
- Images, fonts, media, workers, manifests, forms, and base URLs to their declared sources.
- Parent frames through `frame-ancestors 'none'`.
- Plugin content through `object-src 'none'`.
- Inline event-handler attributes through `script-src-attr 'none'`.

Development adds only the WebSocket and evaluation permissions required by the Next.js development runtime.
Production adds `upgrade-insecure-requests`.

**Current limitation:** the static policy still permits `'unsafe-inline'` for scripts and styles.
It preserves static generation and current integrations, but it is not a strict nonce- or hash-based CSP.

The migration path is documented in `stateworks/work/queued/future-distributed-content-security-policy/brief.md`.

## SSRF

### Purpose

Server-Side Request Forgery (SSRF) occurs when attacker-controlled input influences a server-side network destination.
The attacker may use the application to reach internal services, cloud metadata endpoints, or unexpected public hosts.

Validation must happen at the point where the application turns input into an outbound request:

```text
untrusted URL
  -> parse
  -> authorize destination
  -> resolve and reject private addresses
  -> connect with redirects and timeouts constrained
```

### Current Status

Pressly has no production API path that accepts a URL and performs an outbound request from it.
Therefore, no SSRF middleware is composed today.

Fixed destinations configured by the operator, such as telemetry providers, are configuration trust boundaries rather than user-directed SSRF surfaces.

### Activation Trigger

Add an outbound-request adapter before introducing webhooks, URL previews, remote imports, callbacks, or user-supplied media URLs.
That adapter must own:

- An explicit destination allowlist where the feature permits one.
- HTTP and HTTPS scheme enforcement.
- DNS resolution checks that reject loopback, link-local, private, multicast, and cloud metadata addresses.
- Revalidation on every redirect and a small redirect limit.
- Connection, response, and total request timeouts.
- Response-size limits and safe content-type handling.
- Tests for encoded IPs, IPv6, DNS rebinding, redirects, and mixed public/private answers.

Do not implement SSRF protection as a string-prefix check or a one-time URL parse.

## CSRF

### Purpose

Cross-Site Request Forgery (CSRF) abuses credentials that a browser attaches automatically to a cross-origin request, most commonly cookies.

CORS is not sufficient CSRF protection.
Some browser requests do not require a CORS preflight, and the server must protect state changes based on how credentials are transported.

### Processor and Control Browser Boundaries

Processor and Control each use an opaque server-side session token in their own
`HttpOnly`, `SameSite=Strict` cookie. Production cookies are `Secure` and use
app-specific `__Host-` names. Local HTTP development uses explicitly
non-secure, app-specific cookie names.

JavaScript never receives the reusable session token. A successful login or
session restore returns an app-specific, session-bound CSRF proof. Each browser
application keeps only its own proof in memory and sends it in `X-CSRF-Token`
on unsafe requests.

The boundaries are composed independently in:

- `apps/api/src/http/processor/session/processor-session.boundary.ts`
- `apps/api/src/http/control/session/control-session.boundary.ts`

They apply the same protocol without sharing host authority:

1. Login requires the exact configured origin for that application.
2. `POST`, `PUT`, `PATCH`, `DELETE`, and any other unsafe method require both
   that application's exact origin and its derived CSRF proof.
3. The API derives the expected proof from the opaque session token and a
   domain-separated CSRF secret, then compares it without timing-dependent
   equality.
4. `GET`, `HEAD`, and `OPTIONS` remain free of state changes. Authenticated safe
   requests still require a valid session cookie.
5. Session responses use `Cache-Control: no-store`.

Processor and Control cookies are host-only and use different names. Their
CSRF derivation domains are also different. A cookie or proof issued for one
application is not valid at the other, and neither application relies on a
shared parent-domain session.

Other non-browser API boundaries may use explicit bearer authentication. Do not
add cookie support to one of those routes without defining its origin and CSRF
policy first.

## Request Validation

### Boundary

HTTP input is untrusted even when TypeScript gives the handler a static type.
Runtime parsing must establish the type before a controller or use case consumes the value.

`defineValidatedController` from `@pressly/http/express` binds the body, query,
and path schemas from `packages/contracts` to the one controller allowed to
consume their output. Its synchronous `validate` handler parses once and its
`handle` function receives the typed, fingerprint-protected value explicitly.
When route
scope must be authorized before a command body is inspected, its typed
`validators.params` and `validators.body` handlers preserve that order while
still assembling one controller input. Missing, repeated, mixed, or mutated
validation fails closed. A failed parse throws the standard validation
`AppError`, which the single outer API error middleware presents as a
structured `400` response without invoking the use case.

Request schemas are synchronous and pure. Async lookup, authorization, or
other effects belong in middleware or the application use case, not a Zod
refinement or transform.

Boundary schemas for mutable commands use strict objects so unknown properties are rejected rather than silently accepted.

### Parsing Limits

`apps/api/src/bootstrap/api.composition.ts` applies controls before route
composition:

- JSON content types are required on routes that accept JSON bodies.
- Login bodies are limited to `8kb`.
- Pricing changes are limited to `16kb`.
- MFA codes are limited to `4kb`.
- Other JSON bodies are limited to `64kb`.
- Malformed JSON returns `400`.
- Unsupported media types return `415`.
- Oversized bodies return `413`.

Smaller route-specific parsers run before the global parser, so a sensitive endpoint cannot fall through to the larger limit.

### Feature Rule

Every new HTTP route must:

1. Define its boundary schema in `packages/contracts` when the payload crosses an application boundary.
2. Construct one `defineValidatedController` and register its `validate`
   function before its paired `handle` function. If authorization depends on
   route params and must hide body validity, use `validators.params`, then
   authorize, then `validators.body`, then `handle`.
3. Add a route-specific body limit when `64kb` is unnecessarily large.
4. Reject undeclared fields for state-changing commands.
5. Test malformed values, unknown properties, boundary sizes, and valid parsed output.

Validation constrains data shape and business ranges.
It does not replace authorization, parameterized SQL, HTML sanitization, or output encoding.

## Response and Error Safety

Successful API responses use the `ApiSuccess` envelope from `@pressly/http`.
Failures pass through the final API error handler and use `AppError.safeMessage` rather than the internal diagnostic message.

The error boundary:

- Normalizes unknown and parser errors.
- Avoids sending stack traces or causes to clients.
- Preserves a stable public error code and HTTP status.
- Emits a request ID for server-side correlation.
- Emits security events for rejected validation and server failures.

Error `details` are private diagnostics. Only explicitly reviewed
`publicDetails` may cross the response boundary. Public validation details may
contain field-level issues, but neither field may contain credentials, tokens,
secrets, SQL text, internal paths, or dependency responses.

JSON response envelopes do not make arbitrary HTML safe.
The rendering client must still treat values as text unless the feature explicitly passes through the rich-HTML sanitizer.

## SQL Injection

### Purpose

SQL injection occurs when attacker-controlled data changes the grammar of a SQL statement instead of remaining a data value.

The core invariant is:

> Runtime values must be bound as parameters. They must never be concatenated into SQL source text.

Input validation supports this invariant, but it does not replace parameter binding.
A valid-looking value can still become dangerous when inserted into SQL text incorrectly.

### Query Boundary

Application and module code access database query primitives through `@pressly/db`.

`packages/db/src/query.ts` exposes:

- Drizzle's parameterizing query operators, such as `eq`, `and`, and `lte`.
- A tagged `sql` function that binds each interpolation as a parameter.

It intentionally does not expose `sql.raw` or `sql.identifier`.

Safe value binding:

```ts
sql`select pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;
```

`lockKey` remains a value sent separately from the SQL statement.
It cannot close the function call and append another command.

Prohibited construction:

```ts
sql.raw(`select * from users where email = '${email}'`);
```

The public database API does not provide this escape hatch.

### Dynamic Identifiers

Table and column names are SQL grammar, so database drivers cannot bind them as ordinary parameters.

Production-facing code therefore does not receive a dynamic identifier helper.

The test-only `truncateTestTables` helper is a narrow exception.
It accepts table names only after they match:

```text
^[a-z][a-z0-9_]*$
```

Only then does it convert them to Drizzle identifiers.
Unsafe names are rejected before any query executes.

### Automated Enforcement

`packages/db/test/sql-safety.test.ts` scans source files under `apps`, `modules`, and `packages`.

CI fails when it finds:

- A direct `drizzle-orm` import outside `packages/db/src`.
- A call to `sql.raw(...)` anywhere in scanned source.
- An unsafe table name passed to the test truncation helper.

The test also verifies that the exported Pressly `sql` function has no `raw` or `identifier` properties.

These tests protect the repository boundary, not only the current queries.
A future adapter cannot casually bypass parameterization without making CI fail.

### Trusted Exceptions and Limits

Code inside `packages/db/src` remains a trusted boundary.
Schema definitions, migrations, seeds, health checks, and test infrastructure may require static SQL or direct Drizzle access.

The current controls do not protect against:

- Malicious code already executing inside the application process.
- A compromised database dependency.
- Excessive privileges assigned to the application's database role.
- A deliberately weakened change inside the trusted database package.

Parameterized queries prevent SQL grammar injection.
Least-privilege database roles, dependency controls, review, and monitoring remain separate layers.

## Rate Limiting

### Purpose

Rate limiting bounds how quickly one source can consume application work.
It reduces brute-force and resource-exhaustion pressure, but it is not identity proof or complete denial-of-service protection.

### Implementation

The API applies two fixed-window controls:

- A coarse per-IP limit across public API traffic.
- A stricter per-IP limit on login, layered with the database-backed per-account failure window.

Caddy is the only trusted proxy hop.
Express therefore uses the nearest forwarded address instead of trusting an arbitrary client-supplied chain.

Rejected requests return `429`, `Retry-After`, rate-limit headers, and the normal safe API error shape.
The limiter also emits a security event with the server-generated request ID.

The in-process store is deliberately bounded to prevent unbounded key growth.
It is correct only while one API process is the enforcement unit.

Move the control to a shared edge or datastore before API replicas deploy independently.
Otherwise, each replica would enforce a separate counter and the effective limit would multiply.

### Limits

IP limits can group legitimate users behind one network and can be distributed across attacker-controlled addresses.
Sensitive workflows therefore still need account-level limits, credential lockout policy, authorization, and infrastructure-level traffic controls.

## Observability and Monitoring

### Request Correlation

The API creates a request ID rather than trusting a caller-provided value.
It returns that ID as `X-Request-Id` and attaches it to request, error, authorization, MFA, throttling, and session events.

This makes one request traceable across security decisions without accepting a caller-controlled correlation key.

### Safe Event Data

Security event names and fields are defined in `packages/logging`.
Serialization redacts nested credentials, bearer values, request bodies, and database URL passwords.

Alert candidates include:

- Repeated login failures.
- Unusual authorization denials.
- MFA recovery.
- Privileged mutations.
- Login throttling.
- Failed deploys.

Logs are the current transport.
External alert destinations remain an operational configuration task.
Follow `docs/security/incident-response.md` when investigating an event.

## Feature Security Triggers

Revisit this document when a feature adds any of these capabilities:

| New capability                    | Required control before release                                   |
| --------------------------------- | ----------------------------------------------------------------- |
| Cookie-backed authentication      | CSRF token, origin validation, and cookie policy                  |
| User-controlled outbound URL      | Central SSRF-safe outbound adapter                                |
| Rich HTML authoring or rendering  | Sanitization at the feature boundary and CSP review               |
| File upload                       | Size, media, storage, malware, filename, and download policy      |
| Webhook receiver                  | Signature verification, freshness, replay defense, and body limit |
| New state-changing route          | Strict schema, authorization, body limit, and audit decision      |
| New SQL construction pattern      | Parameterization proof and `sql-safety` test update               |
| Independently scaled API replicas | Shared or edge rate-limit state                                   |
| New browser integration origin    | Narrow CORS and CSP updates with tests                            |

## Verification

Run the control-focused package tests after changing these boundaries:

```bash
pnpm -F @pressly/api test
pnpm -F @pressly/web test
pnpm -F @pressly/db test
pnpm -F @pressly/logging test
```

Run the full repository checks before release:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:int
```
