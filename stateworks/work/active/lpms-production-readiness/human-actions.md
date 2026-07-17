# LPMS Production Readiness Human Actions

## Status

`H1` is ready. Repository implementation and offline proof passed through `V2`.
On 2026-07-17, Steven explicitly authorized temporary unsigned compatibility
with Cents' documented webhook sender so launch is not blocked on signing.
Retry, store, bag-count, reconciliation, and any future signing facts still
require live confirmation before the pilot evidence is complete.

## Secret handling

Never paste a signing key, session credential, recovery code, database URL,
private key, raw customer payload, or production connection string into this
file, Git, screenshots, logs, or agent messages. Human evidence records only
non-secret facts, redacted outcomes, timestamps, versions, and hashes.

## H1 — Confirm the live Cents contract and identifiers

Ask the Cents account or implementation contact for written, redacted
confirmation of all of the following:

1. Whether Cents offers any signing or authentication contract beyond the
   ordinary headers shown in its public webhook documentation. This is a
   future hardening fact, not a launch blocker for the authorized unsigned mode.
2. Retry schedule, request timeout, accepted success status range, ordering,
   duplicate behavior, and whether all documented event types are always sent
   to one endpoint.
3. One representative redacted order payload confirming `action` versus
   `event`, `CANCELLED`, `dueDate`, `updatedAt`, services, `unitPrice` versus
   `unitCost`, and decimal-price semantics.
4. The real Cents store identifiers and their intended Pressly locations,
   provided without customer data and recorded here only if the identifiers are
   not sensitive.
5. Whether an authoritative bag-count field exists and whether Cents offers an
   orders-updated-since API, including pagination and rate limits, for
   reconciliation.

Record only the confirmation date, contact or source, non-secret answers,
redacted payload shape, and non-sensitive store mapping below. Never record the
shared HMAC key, signature, raw customer payload, customer identifier, or PII.

### H1 evidence template

- Confirmation date:
- Cents contact/source:
- Signing/authentication capability:
- Retry/timeout/success behavior:
- Payload aliases and money semantics:
- Non-sensitive store-to-location mapping:
- Authoritative bag count available:
- Updated-orders reconciliation API available:
- Adapter mismatch requiring repository repair:

If Cents later supports signing, switch Pressly back to `hmac` mode through a
separate verified rollout. If any wire fact differs from the implemented
adapter, return the work to `T1`/`T2` repair before relying on that event shape.

## Later gates

- `H2A`–`H2D`: provision host/network/DNS, place external configuration, and
  configure alerts.
- `H3`: approve a verified main-branch release for deployment.
- `H4`–`H5`: bootstrap the real facility and enable Cents delivery under the
  explicitly configured ingress mode.
- `H6`–`H7`: approve and operate the controlled happy-path pilot.
