# Steven Collaboration Profile

Date: 2026-07-16

Domain: steven-collaboration

Topic: durable collaboration, interrogation, and handoff preferences

## Source

- The current Pressly and LPMS Codex conversation with Steven.
- Repeated explicit workflow and design instructions from Steven during the
  same conversation.
- Steven's explicit authorization to create a separate user-level memory.

## Evidence Boundary

This session records non-secret collaboration preferences only.

It does not assert laundry-production truth, implementation correctness,
deployment status, credentials, customer data, or sensitive personal facts.
Steven's current request always overrides this profile.

## Confirmed Preferences

### Domain interrogation

- Ask a compact batch of essential, domain-smart questions.
- Do not continue interrogating after the material ambiguity has converged.
- Re-explain unclear questions instead of treating confusion as agreement.
- Separate facts, decisions, assumptions, and open questions.
- Reflect the converged model before implementation planning.
- Correct Steven when evidence or invariants support a stronger conclusion.

### Engineering judgment

- Use first-principles and distinguished-level engineering judgment.
- Prefer rigorous, coherent data and state models over local patches.
- Keep solutions proportional; rigor does not require architecture theater.
- For LPMS, reason from physical-floor reality and human stability rather than
  treating the operation as an abstract distributed system.
- State strong takes and tradeoffs plainly.

### Authorization and reporting

- Respect report-only, diagnosis-only, planning-only, and no-change requests.
- Begin implementation only after an explicit or clearly implied green light.
- Verify completed work in proportion to its correctness and operational risk.
- Report remaining limitations and unverified external state directly.

### Product and tooling

- Use Product Design for new Processor UI.
- Follow the current official ElevenLabs UI and shadcn language aggressively,
  except for Pressly's color palette.
- Optimize for fast physical-floor ergonomics rather than decorative density.
- Use supplied screenshots for visual review unless Steven explicitly requests
  or permits browser automation.
- Prefer Postman over curl for manual endpoint setup.
- Treat native WSL2 Docker as the default local runtime and verify the daemon
  before changing local containers.

## Memory Separation Decision

```text
Steven's collaboration preferences
  -> steven-collaboration memory

Laundry-production facts and invariants
  -> laundry-production memory

Incomplete code, risks, and next work
  -> Stateworks work packages and evidence
```

This prevents personal working preferences from becoming business rules and
prevents unfinished implementation from being remembered as domain truth.

## Candidate Memory Delta

- `2026-07-16-collaboration-profile.memory-delta.yaml`
