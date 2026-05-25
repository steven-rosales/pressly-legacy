# Security System Design

This is the target shape for Pressly authentication and authorization.

The system is not decentralized in the distributed-systems sense.

It is a modular backend with centralized authentication and module-owned
business execution.

The main boundary is:

```txt
client proof -> API trust boundary -> module authorization -> business usecase -> database
```

## Core Concepts

### Identity

Who exists?

Examples:

- `user_123`
- `service_worker_1`
- `production_operator_7`

An identity is the durable account or service record.

It is not proof that the current request is allowed.

### Credential

How can the identity prove who they are?

Examples:

- password
- API key
- OAuth account
- service token

Credentials are used to create sessions.

They should not be passed to every protected feature command.

### Session

What active proof does the identity currently hold?

Examples:

- browser cookie
- CLI bearer token
- worker token

For the CLI, the raw bearer token is returned once and stored locally.

The database stores only a hash of the token.

### Principal

Who is making this request after authentication?

Examples:

- human user
- service account
- machine worker

The principal is created by the API after it validates the session.

The client does not get to declare the principal.

### Actor

What role is this principal playing in this app context?

Examples:

- admin
- customer
- driver
- production operator

The actor is the principal interpreted for a specific application action.

A principal can later support multiple app contexts, but a request should have a
clear actor before it reaches a business usecase.

### Policy

Is this actor allowed to do this action on this resource?

Example:

```txt
Can admin publish pricing on the global pricing catalog?
```

Policy converts role, permission, resource, and context into an allow or deny
decision.

### Action

The thing the actor wants to do.

Examples:

- publish pricing
- view order
- assign driver
- revoke session

Actions should be named as business capabilities, not HTTP methods.

## API Role

The API creates the Express process composition.

It is the validation and trust boundary for authentication and authorization.

The normal protected route pipe is:

```txt
validate request
-> authenticate session
-> authorize actor
-> controller
-> feature usecase
-> repository port
-> database
```

The API owns request flow.

The modules own business meaning.

## Login Flow

Login is the only place where the password is sent.

```txt
CLI enters email + password
-> POST /auth/login
-> validate request
-> auth module verifies password
-> auth module creates session
-> auth module hashes session token
-> database stores session token hash
-> API returns raw bearer token once
-> CLI stores bearer token locally
```

Important rule:

```txt
password creates session
session authenticates future requests
```

The CLI should not send the password for every command.

## Protected Command Flow

After login, protected feature commands use the bearer token.

```txt
CLI reads stored bearer token
-> sends Authorization: Bearer <token>
-> API validates bearer token
-> API loads session
-> API creates principal
-> API creates actor
-> API checks policy
-> feature module executes command
```

The CLI never sends an actor.

The API creates the actor from trusted server-side session data.

## Authentication Module And Data Design

The authentication module contains the runtime logic for:

- login
- session loading
- logout/session revocation
- authentication middleware
- authorization middleware

The authentication data model contains:

- `identities`
- `password_credentials`
- `sessions`
- `login_attempts`
- `identity_roles`
- `audit_events`

### Identities

Durable record for a human or service.

This answers:

```txt
Who exists?
```

### Password Credentials

Password hash and password metadata for an identity.

This answers:

```txt
Can this identity prove itself with a password?
```

### Sessions

Active or expired login state.

This answers:

```txt
Does this bearer token still represent a valid login?
```

The table should support:

- `issued_at`
- `expires_at`
- `last_used_at`
- `revoked_at`
- token hash

### Login Attempts

Security history for login attempts.

This supports:

- rate limiting
- lockout policy
- suspicious login review

### Identity Roles

Role assignments for an identity.

This answers:

```txt
What app-level powers can this identity receive?
```

Roles are not the same thing as a session.

Sessions prove the request.

Roles shape the actor.

### Audit Events

Immutable security log.

This answers:

```txt
Who did what, when, and through what session?
```

Pricing publish events and sensitive auth events should both be auditable.

## Feature Module Role

Feature modules do not authenticate clients.

They receive trusted actor context from the API pipe.

For pricing, the shape is:

```txt
trusted actor
-> plan/show/publish usecase
-> policy and invariant checks
-> pricing repository port
-> pricing database tables
```

The pricing module owns pricing correctness.

The auth module owns identity and session correctness.

The API connects them.

## Trust Rules

Do not trust the CLI.

Do not trust request bodies for actor identity.

Do not store raw bearer tokens in the database.

Do not make pricing import the auth module.

Do not put auth feature logic directly in `apps/api`.

Do not name the whole system around `admin`.

Admin is one role.

The auth system should also support future customers, drivers, operators, and
service workers.

## Correct Mental Model

```txt
Identity exists.
Credential proves identity.
Session carries active proof.
API validates session.
Principal represents the authenticated requester.
Actor represents the requester inside an app context.
Policy decides permission.
Feature module executes business behavior.
Database preserves the truth.
```

That is the system shape.
