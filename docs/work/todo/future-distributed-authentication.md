# Future Distributed Authentication

## Status

Future design idea. Do not implement while Pressly remains one deployable modular monolith.

The current opaque, server-validated session is the correct production model today.
Adopt this design when independent services need to validate requests without querying the session database on every request.

## Decision

Use a hybrid model:

- A server-side session family is the source of truth.
- A rotating opaque refresh credential maintains the session.
- Short-lived JWT access tokens carry temporary authentication across service boundaries.
- Authorization remains with the resource and policy layers; JWTs do not become permanent role records.

A JWT is a signed, time-limited lease derived from a session. It is not the session itself.

## Adoption Gate

Introduce this system only when at least one condition is real:

- APIs are independently deployed and validate credentials independently.
- External or third-party clients need standardized delegated access.
- An OAuth/OIDC identity-provider boundary is required.
- Central session validation is a measured availability or latency bottleneck.

Do not pass JWTs between modules running in the same process. Resolve the credential once at the application boundary and pass a trusted `Principal` internally.

## Target System

```text
Browser
  | Secure, HttpOnly session cookie
  v
BFF / application backend
  | audience-specific access JWT
  v
Independent resource services

CLI
  | Authorization Code + PKCE or Device Authorization
  v
Authorization server
  | access JWT + rotating refresh credential
  v
Independent resource services

Authorization server
  |-- session and refresh-token database
  |-- signing keys / JWKS
  `-- identity, revocation and authentication policy
```

The BFF owns browser OAuth credentials. Browser JavaScript receives neither access nor refresh tokens.

The CLI stores its refresh credential in the operating-system credential store. It treats access JWTs as opaque values.

## Lifetime Model

```text
Logical session: rolling idle limit plus absolute limit
|-- access JWT: approximately 5 minutes
|-- access JWT: approximately 5 minutes
`-- access JWT: approximately 5 minutes
```

- **Idle expiry:** ends a session that has not refreshed recently.
- **Absolute expiry:** forces authentication after a fixed maximum lifetime.
- **Access expiry:** bounds exposure from a stolen JWT and stale claims.
- **Fresh authentication:** uses the original `auth_time`, not the latest token issue time.

Refreshing rotates credentials inside the existing logical session. A new login creates a new session family, normally one per client and device.

## State Ownership

The authorization server stores:

- Session ID and subject ID.
- Client and device metadata.
- Original authentication time and strength.
- Idle and absolute expiration.
- Revocation status and reason.
- Hashes of refresh credentials; never raw credentials.
- Refresh-family lineage, consumption and replacement state.

Resource services receive a verified authentication context containing the subject, session, client and authentication time.

Roles and mutable permissions should not be treated as permanent JWT facts. Each resource either loads authoritative authorization data, uses a policy service, or explicitly accepts staleness bounded by the access-token TTL.

## Access Token Profile

Use asymmetric signing so resource services verify tokens without possessing the signing key.

Required controls:

- One explicit algorithm allowlist; never trust the token's algorithm choice.
- Explicit token type such as `at+jwt`.
- Exact issuer and audience validation.
- Key ID with controlled key rotation.
- Short expiration and narrow clock-skew allowance.
- Size limits and strict claim parsing.

Expected claims:

- `iss`, `aud`, `sub`
- `iat`, `exp`, `jti`
- `sid`, `client_id`, `auth_time`

Do not include secrets, refresh credentials, personal profile data, policy decisions or broad role collections.

## Core Flows

### Login

1. Authenticate the user and required MFA.
2. Create a logical session family.
3. Create and store the first hashed refresh credential.
4. Issue a short-lived access JWT.
5. Audit the session and credential creation.

### Refresh

1. Lock or atomically consume the presented refresh credential.
2. Validate the session's idle, absolute and revocation state.
3. Invalidate the old refresh credential.
4. Store its replacement and update session activity.
5. Issue a new access JWT and refresh credential.

Two consumers must never successfully use the same refresh credential. Reuse indicates theft or a broken client and revokes the entire session family.

### Request

1. Verify signature, type, issuer, audience and time claims.
2. Convert claims into a trusted authentication context.
3. Resolve current authorization facts where the operation requires them.
4. Apply resource policy and audit the actor and session.

### Logout and Revocation

Logout revokes the session family and all refresh credentials.

Already-issued access JWTs may remain valid until their short expiry. Operations requiring immediate revocation must perform an online session check or use a narrowly scoped revocation cache.

## Service Identity

User access tokens and service identity solve different problems.

Use workload identity or mTLS for service-to-service authentication. When a service acts for a user, preserve both identities: the calling workload and the delegated user. Do not silently turn a user token into unrestricted service authority.

## Keys and Operations

- Keep signing keys in a managed KMS or equivalent secret boundary.
- Publish only public verification keys through JWKS.
- Rotate keys with an overlap longer than the maximum access-token lifetime.
- Retain old public keys until all tokens signed by them expire.
- Alert on unknown keys, invalid signatures, refresh reuse and abnormal refresh volume.
- Never log raw access, session or refresh credentials.
- Correlate activity using safe session and token identifiers.

If the authorization server is unavailable, valid access JWTs continue working until expiry. Refresh and new login fail closed. This bounded independence is the main availability benefit of the design.

## Security Tradeoffs

The hybrid model improves distributed verification and limits access-token lifetime. It also introduces:

- Signing-key lifecycle and compromise response.
- Refresh concurrency and replay detection.
- Revocation delay for already-issued JWTs.
- Clock and audience configuration across services.
- More operational telemetry and incident procedures.

These costs are justified only after the system has real independent trust boundaries.

## Migration Path

1. Harden the current session system and preserve its external contract.
2. Model session families and single-use refresh rotation.
3. Add an asymmetric access-token issuer and strict verifier.
4. Run opaque-session and JWT verification in parallel during migration.
5. Move clients to the refresh lifecycle before splitting services.
6. Introduce audience-specific tokens as resource services become independent.
7. Remove legacy verification only after the longest old session has expired.

## Validation

Prove the design against these failure cases:

- Token tampering, wrong issuer, audience, type, algorithm or key.
- Expired, future-dated, oversized and malformed tokens.
- Concurrent refresh and refresh-token replay.
- Logout, account disablement and permission changes.
- Signing-key rotation and emergency key compromise.
- Authorization-server or database unavailability.
- Device/session listing and selective revocation.
- Preservation of `auth_time` across refreshes.

## References

- RFC 8725 — JSON Web Token Best Current Practices
- RFC 9068 — JWT Profile for OAuth 2.0 Access Tokens
- RFC 9700 — Best Current Practice for OAuth 2.0 Security
- OAuth 2.0 for Browser-Based Applications — IETF draft
- OWASP Session Management Cheat Sheet
