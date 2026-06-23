# Security

The security system for Pressly is not just 'auth'. It is a trust pipeline with separate authentication, authorization, policy, business execution, and audit boundaries.

The model:

credential -> identity/session -> principal + attribute
-> action + resource + environment
-> policy
-> decision
-> usecase
-> audit

## Nouns

**Credential**: evidence presented to the system. Password, bearer token, service key. It proves nothing by itself until verified.

**Identity**: the durable record of a person/service in your system. It answers: 'does this entity exist, and is it active?'.

**Session**: a time-bounded login proof. It answers: 'has this identity already authenticated, and is that authentication still valid?'.

**Principal**: the runtime 'who' on this request. This should stay small: identity id, kind, display name, email, session metadata. No roles and no authority.

**PrincipalAttributes**: authorization facts about the principal. This is where assignments, active status, and assurance level live. It answers: 'what facts about this principal may policy inspect?'.

**RoleAssignment**: not 'the user is an admin'. More precise: 'this principal has role X over scope Y during time window Z'.

**Scope**: the boundary authority. Global, location, resource. This prevents authority from accidentally becoming universal.

**Resource**: the thing being acted on. Example: pricing catalog, pricing change, user session. It must carry a scope so policy can compare the assignment scope against the resource scope.

**Environment**: request-time context. Now, session age, IP, user agent, maybe later device posture of MFA state.

**Policy**: code-reviewed authorization rule. It answers: 'under what conditions is this action allowed or denied?'.

**Decision**: result of authorization: allowed or denied. Denial is not a system failure. It becomes an AppError only at the HTTP/module edge.

## Ownership

**packages/auth** should be the small security language and interpreter: principal, assignments, scopes, resources, policies, decisions, conditions.

**modules/business/auth** authenticates. It verifies credentials/sessions and loads trusted principal facts. It should not know pricing policy.

**modules/policy/access-control**: should own application authorization policy. It maps business routes to resources, actions, and policies.

**modules/<domain-module>**: should own business behavior. It should receive an already-authorized command and execute business logic.

**apps/api** composes the pipeline. It wires middleware and routes, but should not become the owner of policy.

## Example

For publishing pricing:

HTTP request
-> validate body with @pressly/contracts
-> authenticate bearer token
-> load Principal + PrincipalAttributes
-> build Resource: pricing catalog/change with scope
-> authorize action: pricing:publish
-> if denied: HTTP 403 AppError
-> if allowed: call pricing use case
-> audit principal identity + action + resource + decision
