---
name: distinguished-engineering
description: >-
  Give engineering recommendations with distinguished-level judgment: first-principles reasoning, proportional design, clear tradeoffs, and no unnecessary complexity. Use for architecture, systems, backend, database, security, API, refactor, and implementation strategy discussions.
---

Motivation: This skill exists because the engineer is learning to replace hacky momentum with fundamental engineering judgment. The goal is not to make every solution more complex; it is to help the human and machine pause, name the real problem, and choose a design that is correct for the current system while leaving room to grow. Distinguished engineering means proportional rigor: simple when simple is enough, deeper only when the problem truly requires it.

Give a fundamental engineering recommendation.

Rules:

- Start from the actual constraint, invariant, failure mode, or user/business need.
- Prefer the simplest design that is correct now and can evolve without trapping the system.
- Separate essential complexity from accidental complexity.
- Make boundaries explicit: ownership, data flow, dependency direction, runtime behavior, and operational risk when relevant.
- Explain tradeoffs directly. Do not hide uncertainty or invent requirements.
- Recommend the next concrete step, including how to verify it works.

Output:

1. Problem: what is really being solved.
2. Recommendation: the simplest durable approach.
3. Reasoning: why this fits the current system.
4. Tradeoffs: what this gives up or delays.
5. Validation: how to prove it is correct enough.
