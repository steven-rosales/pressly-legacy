# Auth Data Model

Quick reference for the persisted data behind Pressly authentication and
authorization.

This document is about stored facts.

Policy behavior is explained in [Security](../security.md).

## Short Model

The database stores durable security facts:

```txt
identity
credential
session
login attempt
role projection
role assignment
audit event
```

The runtime builds authorization inputs from those facts:

```txt
auth_identities
+ auth_sessions
+ auth_role_assignments
-> Principal
+ PrincipalAttributes
-> policy decision
```

Do not model authorization as a saved "allowed" decision.

Authorization is evaluated at request time from:

```txt
principal
principal attributes
action
resource
environment
policies
```

## Current Shape

```txt
auth_identities
  1 -> many auth_password_credentials
  1 -> many auth_sessions
  1 -> many auth_login_attempts
  1 -> many auth_audit_events as actor_identity_id
  1 -> many auth_identity_roles
  1 -> many auth_role_assignments
```

Historical detail:

```txt
The table is currently named auth_identities.
It was previously misspelled as auth_identites.
```

That spelling was corrected through a dedicated migration.

## Ownership

`packages/db` owns the physical schema.

`packages/auth` owns the security language:

- identity
- principal
- session
- role
- assignment
- scope
- resource
- policy
- decision

`modules/business/auth` owns persistence and hydration:

- verify credentials
- create and revoke sessions
- record login attempts
- load principal facts from the database
- map stored assignments into runtime assignments

`modules/policy/access-control` owns application policy:

- action choice
- resource construction
- allow and deny rules
- scoped-role requirements

Business modules should receive authorized commands.

They should not decide how a principal received authority.

## Tables

### `auth_identities`

Durable identity record.

An identity answers:

```txt
Does this human or service exist in Pressly?
Is it active?
How do we identify it?
```

Key columns:

- `id`
- `kind`
- `display_name`
- `email`
- `email_normalized`
- `is_active`
- `created_at`
- `updated_at`

Current identity kinds in the auth language:

```txt
human
service
```

Important rules:

- `email` is unique when present.
- `email_normalized` is unique when present.
- login lookup uses `email_normalized`.
- inactive identities cannot load a valid session.
- inactive identities are also denied by policy through `identityActive`.

An identity is not the same thing as a principal.

The identity is stored.
The principal is derived for one authenticated request.

### `auth_password_credentials`

Password verifier state for an identity.

Key columns:

- `id`
- `identity_id`
- `password_hash`
- `password_updated_at`
- `created_at`
- `updated_at`

Important rules:

- raw passwords are never stored.
- login verifies the submitted password against `password_hash`.
- password rotation should create a clear rule for current versus old hashes.

Current implementation detail:

```txt
The code treats this as one current password credential per identity,
but the database does not currently enforce a unique identity_id here.
```

If password history or rotation is added later, model that explicitly instead
of relying on accidental multiple rows.

### `auth_sessions`

Time-bounded login proof.

The session proves that an identity authenticated recently enough to use the
system.

It does not grant authority by itself.

Key columns:

- `id`
- `identity_id`
- `token_hash`
- `issued_at`
- `expires_at`
- `revoked_at`
- `last_used_at`
- `created_at`

Important rules:

- raw bearer tokens are never stored.
- `token_hash` is unique.
- a session is usable only when it is not expired and not revoked.
- loading a session updates `last_used_at`.
- revoking a session sets `revoked_at`.

Session load joins:

```txt
auth_sessions
+ auth_identities
+ auth_role_assignments
```

The result becomes:

```txt
Principal
PrincipalAttributes
```

### `auth_login_attempts`

Login-attempt history for rate limiting and investigation.

Key columns:

- `id`
- `email_normalized`
- `identity_id`
- `success`
- `failure_code`
- `ip_address`
- `user_agent`
- `created_at`

Important rules:

- attempts are recorded even when the identity is unknown.
- `identity_id` is optional because failed login can happen before identity is
  trusted.
- rate limiting counts recent failed attempts by normalized email.
- this table should not store passwords, tokens, or secret material.

### `auth_audit_events`

Append-only security audit log.

Key columns:

- `id`
- `actor_identity_id`
- `event_type`
- `resource_type`
- `resource_id`
- `metadata`
- `created_at`

Current event examples:

- `auth.owner_bootstrapped`
- `auth.login.succeeded`
- `auth.logout`

The column name `actor_identity_id` is current schema language.

Conceptually, read it as:

```txt
the identity that caused the event, when known
```

Do not introduce a separate Actor domain model for new auth code.

Important rules:

- `actor_identity_id` is optional for bootstrap, system, or unknown-identity
  events.
- `metadata` must be safe operational context.
- never write passwords, bearer tokens, token hashes, or other secrets into
  metadata.

### `auth_identity_roles`

Flat role projection for compatibility and API response shape.

Key columns:

- `id`
- `identity_id`
- `role`
- `created_at`
- `created_by_identity_id`

Current use:

- login reads this table to return `principal.roles`.
- owner bootstrap writes `owner` here.

Session loading does not use this table for authorization.

The session endpoint derives its public role list from loaded assignments.

This table is not the ABAC authority source.

It does not store scope.
It does not store assignment windows.
It cannot answer whether a role applies to a specific resource.

Use `auth_role_assignments` for authorization.

Future cleanup option:

```txt
derive public role lists from auth_role_assignments
or remove role lists from public auth results
```

Until then, keep bootstrap and role-management writes consistent across:

```txt
auth_identity_roles
auth_role_assignments
```

### `auth_role_assignments`

Scoped authority grants.

This is the source table for ABAC role authority.

An assignment says:

```txt
this identity has this role
inside this scope
during this optional time window
```

Key columns:

- `id`
- `identity_id`
- `role`
- `scope_kind`
- `scope_id`
- `scope_resource_type`
- `starts_at`
- `ends_at`
- `created_at`
- `created_by_identity_id`

Roles:

```txt
owner
admin
operator
customer
driver
service
developer
ci
```

Scope shapes:

```txt
global:
  scope_kind = global
  scope_id = *
  scope_resource_type = *

location:
  scope_kind = location
  scope_id = <location id>
  scope_resource_type = *

resource:
  scope_kind = resource
  scope_id = <resource id>
  scope_resource_type = <resource type>
```

Database constraints:

- unique assignment by identity, role, scope kind, scope id, and resource type.
- resource scope must have a real `scope_resource_type`.
- global and location scopes must use `scope_resource_type = '*'`.
- indexes exist for identity lookup and scope lookup.

Runtime mapping:

```txt
auth_role_assignments
-> RoleAssignment[]
-> PrincipalAttributes.assignments
```

Important rules:

- assignments do not directly allow actions.
- policies decide whether an assignment is enough for an action.
- expired or not-yet-started assignments are inactive.
- global scope covers every resource scope.
- location scope covers only the same location.
- resource scope covers only the same resource type and id.

## Runtime Objects

### Identity

Stored account fact.

Source table:

```txt
auth_identities
```

Used for:

- login lookup
- active/inactive status
- display and contact identity
- session hydration

### Principal

Request-time caller.

Derived from:

```txt
auth_identities
+ auth_sessions
```

Shape:

```txt
identityId
kind
displayName
email
sessionId
sessionIssuedAt
sessionExpiresAt
```

The principal is the "who" for the current request.

It should stay small.

It should not contain policy logic.

### Principal Attributes

Trusted facts policy may inspect.

Derived from:

```txt
auth_identities.is_active
+ auth_role_assignments
```

Current shape:

```txt
assignments
identityActive
assuranceLevel
```

The principal says who is calling.

The principal attributes say what trusted facts are known about that caller.

## Main Flows

### Owner Bootstrap

Creates the first owner under an advisory transaction lock.

Writes:

```txt
auth_identities
auth_password_credentials
auth_identity_roles
auth_role_assignments
auth_audit_events
```

The owner assignment is global:

```txt
role = owner
scope_kind = global
scope_id = *
scope_resource_type = *
```

That owner does not bypass authorization.

The owner passes policies because a global owner assignment covers the resource
scope being checked.

### Login

Reads:

```txt
auth_identities by email_normalized
auth_password_credentials by identity_id
auth_identity_roles by identity_id
auth_login_attempts recent failures
```

Writes:

```txt
auth_sessions
auth_login_attempts
auth_audit_events
```

Returns:

```txt
access token
expiry
public principal projection
```

The raw access token is returned once to the caller.

Only its hash is stored.

### Load Session

Reads:

```txt
auth_sessions by token_hash
auth_identities by identity_id
auth_role_assignments by identity_id
```

Checks:

```txt
identity active
session not revoked
session not expired
```

Writes:

```txt
auth_sessions.last_used_at
```

Returns:

```txt
Principal
PrincipalAttributes
```

### Authorize Request

Does not write auth tables.

Uses:

```txt
Principal
PrincipalAttributes
Action
Resource
Environment
PolicyRule[]
```

The database stores assignments.

The policy engine interprets assignments for a specific action and resource.

### Logout

Writes:

```txt
auth_sessions.revoked_at
auth_audit_events
```

Logout is intentionally idempotent at the API level.

If the token is already invalid, the caller still receives:

```txt
{ revoked: true }
```

## Modeling Rules

### Store Facts, Not Decisions

Good stored facts:

```txt
identity is active
session expires at this time
identity has owner at global scope
identity has operator at location scope
```

Bad stored fact:

```txt
identity can publish pricing
```

The second one is a policy decision.

It belongs in access-control policy, not the data model.

### Keep Credentials Separate From Identity

Identity says who exists.

Credentials say how that identity proves control.

This keeps password, token, service key, and future MFA modeling from bloating
the identity row.

### Keep Sessions Separate From Authority

Session validity answers:

```txt
is this caller authenticated right now?
```

Assignments and policy answer:

```txt
may this caller do this action to this resource?
```

Do not put roles, scopes, or permissions on `auth_sessions`.

### Keep Role Assignment Scoped

This is incomplete:

```txt
identity has admin
```

This is the model:

```txt
identity has admin within global/location/resource scope
```

Even if the first production users are global owners, keep new authority grants
scoped.

### Keep Audit Metadata Safe

Audit metadata should explain what happened.

It should not become a secret sink.

Allowed examples:

```txt
email_normalized
reason
changed field names
request correlation id
```

Forbidden examples:

```txt
password
raw access token
token hash
password hash
session cookie
```

## Current Rough Edges

### Renamed Identity Table

The current table is:

```txt
auth_identities
```

Older databases may have been created with:

```txt
auth_identites
```

The dedicated rename migration moves those databases to `auth_identities`.

New docs and code should use only `auth_identities`.

### Two Role Tables

There are currently two role-shaped tables:

```txt
auth_identity_roles
auth_role_assignments
```

Read them as different responsibilities:

```txt
auth_identity_roles:
  public role projection / compatibility

auth_role_assignments:
  scoped authorization grants
```

New authorization logic should use `auth_role_assignments`.

### Password Credential Cardinality

The application currently behaves as if there is one current password
credential per identity.

The database does not enforce that yet.

If that matters for production hardening, add an explicit uniqueness or
credential-versioning design instead of relying on query order.

## Adding A New Security Feature

Use this checklist before adding auth data:

1. Is this durable fact about an identity, credential, session, assignment, or
   audit event?
2. Is this actually a policy decision that belongs in
   `modules/policy/access-control`?
3. Does this data contain secret material?
4. Does it need a revocation path?
5. Does it need an expiry or active window?
6. Does it need scope?
7. Does the API need this as a public contract, or is it internal persistence?
8. Will it be available when loading a session, or should policy fetch it
   separately?

Default answer:

```txt
Persist stable security facts.
Derive principals and attributes per request.
Evaluate policy per action.
Audit security-relevant changes.
```
