# LPMS Production Readiness Human Actions

## Status

`H1` is ready. Repository implementation and offline proof passed through `V2`.
Work is intentionally stopped here until the live Cents contract is confirmed.
All infrastructure, secret placement, vendor enablement, deployment, and pilot
actions remain blocked.

## Secret handling

Never paste a signing key, session credential, recovery code, database URL,
private key, raw customer payload, or production connection string into this
file, Git, screenshots, logs, or agent messages. Human evidence records only
non-secret facts, redacted outcomes, timestamps, versions, and hashes.

## H1 — Confirm the live Cents contract and identifiers

Ask the Cents account or implementation contact for written, redacted
confirmation of all of the following:

1. Every delivery and retry sends `X-Cents-Timestamp` as Unix seconds and
   `X-Cents-Signature` as `v1=<hex HMAC-SHA256>`, computed over the timestamp, a
   period, and the exact raw request body bytes.
2. Cents does not parse and reserialize the body between signing and sending.
3. Retry schedule, request timeout, accepted success status range, ordering,
   duplicate behavior, and whether all documented event types are always sent
   to one endpoint.
4. One representative redacted order payload confirming `action` versus
   `event`, `CANCELLED`, `dueDate`, `updatedAt`, services, `unitPrice` versus
   `unitCost`, and decimal-price semantics.
5. The real Cents store identifiers and their intended Pressly locations,
   provided without customer data and recorded here only if the identifiers are
   not sensitive.
6. Whether an authoritative bag-count field exists and whether Cents offers an
   orders-updated-since API, including pagination and rate limits, for
   reconciliation.
7. Optional stable Cents egress IP ranges as defense in depth only; IP filtering
   does not replace HMAC authentication.

Record only the confirmation date, contact or source, non-secret answers,
redacted payload shape, and non-sensitive store mapping below. Never record the
shared HMAC key, signature, raw customer payload, customer identifier, or PII.

### H1 evidence template

- Confirmation date:
- Cents contact/source:
- Required HMAC contract accepted:
- Retry/timeout/success behavior:
- Payload aliases and money semantics:
- Non-sensitive store-to-location mapping:
- Authoritative bag count available:
- Updated-orders reconciliation API available:
- Optional egress ranges documented:
- Adapter mismatch requiring repository repair:

If Cents cannot support the required timestamped HMAC contract, do not enable
delivery. If any wire fact differs from the implemented adapter, return the work
to `T1`/`T2` repair before configuring infrastructure or secrets.

## Later gates

- `H2A`–`H2D`: provision host/network/DNS, place external configuration, and
  configure alerts.
- `H3`: approve a verified main-branch release for deployment.
- `H4`–`H5`: bootstrap the real facility and enable signed Cents delivery.
- `H6`–`H7`: approve and operate the controlled happy-path pilot.
