# Identity Access Context Pack

## Domain

Identity Access (`identity-access`)

## Summary

Durable domain memory for Pressly business membership, workforce invitations, scoped access grants, credentials, sessions, and application capabilities. Canonical customer profiles and commercial Orders remain separate peer domains.

## Invariants

- customer_user_and_auth_identity_are_distinct: A canonical customer User and an Auth identity are independent objects; neither email nor phone may silently create, merge, or link one to the other.
- authority_has_business_and_location_ancestry: Every workforce membership, grant, capability, customer query, Order query, and Production action resolves through explicit persisted business and location ancestry; request-body authority and deployment- global SMB ownership are forbidden.
- workforce_lifecycles_use_authoritative_graphs: Invitation is pending to accepted, revoked, or expired; membership is active to suspended, suspended to active, and active or suspended to ended; grant is active to revoked or expired. Terminal states expose no further lifecycle event, and callers submit events rather than target states.
- access_reduction_revokes_sessions_atomically: Suspension, ending, grant reduction, password or MFA recovery, and global identity lock revoke affected application sessions in the same transaction as the security-state change.
- last_active_owner_is_preserved: Concurrent commands cannot suspend, end, or remove the ownership grant of the final active owner of a business.
- managers_cannot_escalate_authority: A manager may manage only operators inside the manager's active business and location grants and may never create or modify owners or managers, change their own authority, grant deployment-global access, or exceed their scope.
- privileged_capabilities_require_mfa: Owner and manager capabilities are ineffective until MFA is enrolled and require current MFA assurance for workforce, credential, session, and security mutations.
- application_sessions_are_host_isolated: Processor and Control use distinct host-only Secure HttpOnly SameSite Strict opaque-session cookies and distinct CSRF derivation boundaries; no credential is shared through a parent-domain cookie, browser storage, URL, or app switch.
- security_commands_are_versioned_idempotent_and_audited: Invitation, membership, grant, credential, MFA, and session mutations require expected versions and idempotency keys and atomically record bounded audit evidence without secrets or customer PII.

## Policies

- invitation_bearer_secret_policy: Invitation and reset secrets use at least 32 random bytes, keyed hashes at rest, bounded expiry, per-token and per-client throttling, transactional single use, rotation on reissue, fragment bootstrap, immediate browser-history removal, generic errors, and no analytics or referrer leakage.
- shared_device_session_policy: Processor provides a prominent Lock or Switch Employee action that revokes server session state and clears browser-held operational data; session lifetimes respect a production shift, while Control uses a shorter idle lifetime and fresh MFA for privileged actions.
- capability_manifest_policy: Browser navigation, app destinations, and controls consume server-evaluated capabilities for the selected business and location and never reconstruct authority from role strings; API and use-case policy checks remain final.

## Decisions

- identity_security_aggregate_lives_in_auth: Credentials, MFA, sessions, workforce membership, invitations, and scoped grants live inside the Auth security aggregate so invitation acceptance and offboarding remain atomic, while Users and Orders remain separate peer modules.
- control_is_a_separate_application: Pressly Control is a separate management-plane application with its own browser session boundary and the same shared shadcn and Tailwind design language as Processor; Processor remains the physical-execution workspace.
- opaque_server_sessions_remain_authoritative: Pressly retains opaque server-validated sessions while Auth, Control, Processor, and the API remain one deployable modular monolith; distributed JWT or OIDC adoption remains gated by a real independent service boundary.

## Workflows

- invite_workforce_member: a currently authorized and freshly MFA-assured owner or manager selects one business, intended role, and allowed locations -> the application re-evaluates the actor's current membership and grants inside the transaction -> Auth creates one pending invitation with expected version, bounded expiry, hashed random token, command receipt, and audit evidence -> the raw invite link is returned once for deliberate delivery and is never stored in browser storage, audit metadata, logs, or Stateworks -> acceptance proves the exact identity or creates a new identity with the invitee's own password and MFA when the intended role is privileged -> one transaction accepts the invitation, activates membership and grants, writes transition evidence, and invalidates the token
- change_workforce_access: an authorized actor submits a named suspend, reactivate, end, grant, revoke, or expire command with expected versions, reason, and idempotency key -> Auth locks and reloads the actor, target membership, affected grants, and last-owner count -> the authoritative membership and grant graphs decide the event and policies enforce business, location, delegation, self-escalation, and owner invariants -> one transaction updates versioned current state, appends transitions and audit evidence, stores the command receipt, and revokes affected sessions when authority is reduced
- authorize_application_action: the application loads the opaque host-specific session and current identity state -> Auth loads current business membership, grants, assurance, and selected-location ancestry -> server policies evaluate one named action against the exact persisted resource -> the browser receives only a safe capability and destination manifest -> every mutation re-evaluates the same authority inside its transaction

## Vocabulary

- actor:business_owner: A human with business-wide authority who can manage managers, operators, locations, customer and Order administration, and security settings without receiving deployment-global platform authority.
- actor:business_manager: A human who may manage operators and business work only inside explicitly granted business and location scope.
- actor:production_operator: A human who performs authorized physical-floor work with an individually attributable Pressly identity.
- object:business_account: The explicit authority and data-ancestry root for one Pressly SMB and its locations, workforce memberships, customers, and Orders.
- object:auth_identity: A security identity that owns credentials, MFA state, global security lock state, and sessions but is not itself a customer profile.
- object:workforce_membership: One identity's versioned relationship to one business with active, suspended, or ended lifecycle state.
- object:workforce_invitation: A versioned pending offer bound to one normalized email, business, intended role and location scope, and one hashed single-use bearer token.
- object:access_grant: One versioned and auditable role assignment whose authority is bounded to a business, location, or resource and whose lifecycle is active, revoked, or expired.
- object:application_session: An opaque server-validated session scoped to one Pressly browser application and re-evaluated against current identity, membership, grant, and assurance truth.

## Assumptions

- None recorded.

## Open Questions

- None recorded.
