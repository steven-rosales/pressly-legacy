# Auth Data Model

Pressly Access owns identity, credentials, sessions, workforce membership, and
authorization facts. This document describes the clean current schema, not an
upgrade path from a prior authorization model.

Policy behavior is explained in
[Authorization and Authentication](../security/authz-authn.md).

## Authority Model

The durable workforce chain is:

```text
business_accounts
  -> workforce_memberships
  -> auth_access_grants
```

Invitations create or select an Auth identity, then establish the membership
and grants explicitly:

```text
workforce_invitations
  -> auth_identities
  -> workforce_memberships
  -> auth_access_grants
```

Only three authorization roles exist:

```text
owner
manager
operator
```

`auth_access_grants` is the only persisted role authority. Every grant has a
business, membership, identity, scope, lifecycle state, version, and optional
effective window. Authorization evaluates current grants at request time; it
does not persist an `allowed` decision.

## Schema Ownership

`systems/access/src/schema/public.ts` exposes one `makeAccessSchema()` owner
factory. It composes Access's scope and identity tables internally, preserving
Access-local business and location foreign keys. Topology receives the one
complete Access segment and combines it with the other owner schemas for
migration discovery.

No Access table has a foreign key to a peer System.

## Core Tables

### `business_accounts`

The business ancestry root for workforce authority and Access-owned location
scope.

Important facts:

- `slug` is unique and normalized;
- state is `active` or `suspended`;
- version is positive.

### `access_production_locations`

Access's canonical authorization-scope identity for a production location.
Production owns a separate operational projection. Access locations retain a
same-owner foreign key to `business_accounts`.

### `auth_identities`

The security identity that owns credentials and sessions.

Key fields:

- `id`;
- optional opaque `customer_id`;
- `kind`, either `human` or `service`;
- display name and normalized email;
- active state.

`customer_id` is not a foreign key. Customers owns Customer existence and
profile truth. Access merely stores an explicit opaque linkage fact. A linked
human principal is projected with both:

```text
audience = customer
customerId = <opaque Customer ID>
```

The two values are present together or absent together. Customer Experience
requires them before admitting an Access session to the Customer realm. A
Customer is not represented by a global role.

Service identity remains an identity kind. It is not a global `service` role.

### Credential and MFA tables

```text
auth_password_credentials
auth_mfa_credentials
auth_mfa_recovery_codes
auth_mfa_challenges
```

Raw passwords, MFA secrets, recovery codes, and bearer tokens are never stored
as plaintext. Platform Auth provides business-neutral hashing, encryption,
TOTP, and token mechanisms; Access owns their Pressly lifecycle.

### `auth_sessions`

Opaque server-side sessions contain identity, token hash, assurance, issuance,
expiry, revocation, and last-use facts. They do not store roles or permissions.

Session hydration reads:

```text
auth_sessions
+ auth_identities
+ active workforce_memberships
+ active auth_access_grants
```

It returns:

```text
Principal
  identityId
  kind
  optional customer audience and customerId
  displayName
  optional email
  session timestamps

PrincipalAttributes
  assignments with required lifecycle state and version
  identityActive
  assuranceLevel
```

### `workforce_memberships`

The versioned relationship between one identity and one business. Its states
are `active`, `suspended`, and `ended`.

### `auth_access_grants`

The only role-assignment table. A grant contains:

```text
business_id
membership_id
identity_id
role
scope_kind
scope_id
location_id
state
version
starts_at
ends_at
```

The database constrains roles to `owner`, `manager`, and `operator`. Owner
grants are business-scoped; manager grants are business- or location-scoped;
operator grants are location-scoped. Every runtime `RoleAssignment` has an
explicit state and version.

### Lifecycle, receipt, and audit tables

```text
auth_lifecycle_transitions
auth_command_receipts
auth_login_attempts
auth_audit_events
```

Transitions record valid invitation, membership, and grant events. Receipts
make retryable commands idempotent. Login attempts support rate limiting.
Audit metadata is bounded operational evidence and never contains secrets,
raw tokens, token hashes, password hashes, or Customer payloads.

## Main Flows

### Owner bootstrap

Under one Access transaction, bootstrap creates:

```text
business account
Auth identity and password credential
active workforce membership
active business-scoped owner grant
audit evidence
```

The serialized bootstrap input carries the business ID, normalized slug, and
display name explicitly. A retry succeeds without changing credentials only
when the root owner email, verified password, and active business facts match
exactly; legitimate additional owners do not block that root replay.
Incompatible business, owner, or credential facts are typed conflicts.

There is no duplicate global role write.

### Login and MFA

Login verifies the identity and credential, then either creates an opaque
session or an MFA challenge. Password and MFA completion results carry the
same explicit optional Customer audience linkage and the current workforce
role projection.

Experience boundaries decide whether that authenticated identity belongs in a
particular application realm:

- Customer requires `audience = customer` and `customerId`;
- Processor and Control resolve current workforce capabilities from persisted
  memberships and grants;
- a service identity is evaluated by identity kind and its narrow credential
  or capability path.

### Load session

Access validates active identity, revocation, absolute expiry, and idle expiry,
touches `last_used_at`, and returns current principal and assignment facts.
Reducing authority therefore affects the next authorization decision without
rewriting session rows.

### Authorization

Policies evaluate:

```text
Principal
PrincipalAttributes
Action
Resource
Environment
PolicyRule[]
```

Order management uses scoped owners and managers. Production uses scoped
owners, managers, and operators, with active owner or manager authority for
the owner-wide resource bootstrap action. Pricing planning and publication
require an active owner plus MFA; publication also requires a fresh session.
Auth-session operations allow self-management and MFA-assured owner
administration.

## Modeling Rules

- Keep canonical Customer profile meaning in Customers.
- Keep Auth identity and Customer linkage explicit and independent.
- Keep workforce authority in memberships and grants, never in audience or
  identity-kind strings.
- Keep role assignments versioned, lifecycle-aware, and scoped.
- Keep sessions separate from authority.
- Store facts, not authorization decisions.
- Keep secrets and Customer payloads out of audit metadata.
- Add a new role only with a real writer, scope semantics, lifecycle behavior,
  policies, and end-to-end proof.
