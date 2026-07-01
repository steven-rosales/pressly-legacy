# Future Distributed Content Security Policy

## Status

Future hardening path.

Today, the web app sends one enforced static CSP from `next.config.ts`.
It preserves static generation and ISR.

## Current Boundary

The server returning the browser document owns its CSP.

- The Next.js web app protects its HTML document.
- APIs enforce CORS, authentication, authorization, and input validation.
- Internal services do not emit a CSP for the web app.

CSP limits what a browser page may load or execute.
It does not secure service-to-service traffic.

## Current Tradeoff

The static policy allows `'unsafe-inline'` for scripts and styles because the current Next.js output and UI integrations require it.

This is useful baseline protection, not the final strict policy.

The current policy still blocks:

- Unknown connection, frame, media, font, and image origins.
- Browser plugins such as Flash through `object-src 'none'`.
- Inline event-handler attributes through `script-src-attr 'none'`.
- Framing Pressly pages through `frame-ancestors 'none'`.

## Adoption Gate

Revisit the policy when at least one condition is real:

- The browser handles sensitive authenticated workflows.
- Independent frontends or domains serve Pressly pages.
- A CDN or edge gateway becomes the document-response boundary.
- New analytics, payment, storage, or media origins are required.
- CSP violation volume can be collected and operated reliably.

A distributed system alone does not require nonce-based CSP.

## Target Ownership

Each independently served frontend owns its own least-privilege policy.

```text
Browser
  | receives HTML + CSP
  v
Web origin / BFF / edge gateway
  | allowed connect-src destinations
  v
API gateway
  v
Independent services
```

Keep browser source rules in a typed, reviewed manifest.
Use exact origins per environment; avoid broad wildcards.

## Hardening Path

1. Add `Content-Security-Policy-Report-Only` for the proposed stricter policy.
2. Send reports to a rate-limited collector that removes credentials and personal data.
3. Remove unused source origins from observed browser traffic.
4. Remove `'unsafe-inline'` from scripts using nonces or stable build-time hashes.
5. Remove `'unsafe-inline'` from styles after inline-style dependencies support nonces or external styles.
6. Enforce the stricter policy after the report-only violation rate is understood.

If nonces are chosen, generate one unpredictable value per document request.
Apply it at the web or edge boundary, never in downstream APIs.

Nonce-based CSP makes matched Next.js pages dynamic because every response needs different HTML.
Prefer hashes or stable Subresource Integrity when static generation remains the higher-value constraint.

## Distributed Rollout

1. Inventory every document origin and browser-visible dependency.
2. Assign one policy owner for each frontend origin.
3. Version policy changes with the frontend deployment that needs them.
4. Deploy in report-only mode to one environment or traffic slice.
5. Verify navigation, API calls, telemetry, scheduling, images, fonts, and workers.
6. Enforce gradually and retain a fast rollback to the previous policy.

Do not loosen the global policy for one feature by default.
Prefer a route-specific policy or same-origin proxy when the exception is narrow.

## Validation

Before enforcing a changed policy, prove:

- Static and ISR routes remain static unless dynamic rendering was intentional.
- Cents scheduling frames load only from the approved origin.
- API, PostHog, and Sentry traffic reaches exact configured origins.
- Injected inline event handlers and unknown scripts are blocked.
- CSP reports contain no session credentials, request bodies, or personal data.
- CDN caches do not reuse nonce-bearing HTML across responses.

## Next Step

Keep the current static policy until a real adoption-gate condition appears.
When it does, begin with report-only telemetry rather than immediately adding nonces.
