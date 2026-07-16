# Pressly Agent Guidance

## Load Context First

Before substantive product, domain, architecture, or implementation work:

1. Read `stateworks/memory/index.yaml`.
2. Load `stateworks/memory/domains/steven-collaboration/context-pack.md`.
3. For LPMS work, also load
   `stateworks/memory/domains/laundry-production/context-pack.md`.
4. Inspect relevant work under `stateworks/work/active/` and
   `stateworks/work/queued/` before planning new work.

## Memory Boundaries

- Steven's explicit request in the current task overrides saved preferences.
- Collaboration preferences belong in `steven-collaboration` memory.
- Laundry-production facts, invariants, and policies belong in
  `laundry-production` memory.
- Unfinished implementation state belongs in Stateworks work items and
  evidence, not in durable domain memory.
- Apply durable memory changes through source-backed, validated deltas.
- Never store secrets, credentials, customer payloads, or private tokens in
  Stateworks.
