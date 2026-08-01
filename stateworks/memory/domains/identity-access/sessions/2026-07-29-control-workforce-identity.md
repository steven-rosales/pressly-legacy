# Pressly Control And Workforce Identity Decision Session

Date: 2026-07-29
Domain: identity-access
Topic: Individual workforce identity and Pressly Control authority

## Source

- Steven's confirmed request to replace routine owner/root access with
  individual manager and operator identities and to build Pressly Control for
  team, customer, and canonical Order administration.
- The accepted product direction includes an authorization-aware switch between
  Processor and `control.trypressly.com`, the same shadcn and Tailwind design
  language, and proportionate but aggressive security hardening.
- Repository characterization is recorded in
  `stateworks/work/active/pressly-control-workforce-identity/evidence.md`.

## Confirmed Facts

- Auth identity and a canonical customer User are different concepts. A
  customer profile may exist without a login, and an employee identity is not a
  customer merely because contact fields match.
- Processor remains the physical-execution workspace. Control is the
  management-plane workspace for authorized owners and managers.
- Owners, managers, and operators need individual attributable identities.
- Control also lists and creates canonical customers and Orders through their
  owning modules.

## Decisions

- Auth owns one identity security aggregate containing credentials, MFA,
  sessions, workforce membership, invitations, and scoped grants.
- Membership, invitation, and access grant each retain an explicit persistent
  lifecycle governed by the shared kernel state-machine interpreter.
- Business and location ancestry are explicit. Deployment-global access is
  reserved for platform authority, not an SMB owner.
- Managers may manage operators only inside their own active business and
  location authority. Managers cannot create managers or owners, change their
  own authority, or grant outside their scope.
- Privileged capabilities require MFA assurance. Routine operator floor work
  should not repeatedly interrupt a production pulse with step-up prompts.
- Control and Processor use separate host-only opaque sessions and separate
  CSRF boundaries. The product switch is a constant, server-authorized
  destination and carries no credential or redirect parameter.
- Invitation and security mutations are versioned, idempotent, auditable, and
  safe under replay and concurrency.

## Assumptions

- The initial deployment contains one Pressly business, but authority and data
  ancestry are modeled explicitly before Control list endpoints ship.
- Automated invitation email is not available in this work. A freshly
  authorized manager may copy a one-time link that is displayed once.

## Open Questions

- Which email delivery provider, if any, should distribute invitations after
  the one-time copy workflow is operationally proven?
- When a second business is real, which database RLS model best complements the
  existing business predicates and composite constraints?

## Evidence Boundary

- This session records accepted product and domain direction. It does not claim
  that persistence, API, UI, deployment, or employee adoption is complete.
- No password, session value, invitation token, MFA secret, recovery code,
  customer payload, credential, or private identifier is recorded.

## Candidate Memory Deltas

- Add workforce actors and identity-access objects.
- Add invitation, membership, grant, and session workflows.
- Add business/location, MFA, revocation, last-owner, customer separation,
  server-capability, and audit invariants.
