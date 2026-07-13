---
name: interrogation
description: >-
  Run a focused domain interrogation before implementation, architecture,
  product design, writing, planning, modeling, or strategy work when the user
  has important unstated domain context. Use when the user asks to be grilled,
  interrogated, questioned, pressure-tested, or converged with before the agent
  proposes a solution.
---

Motivation: This skill exists because the user often knows the domain better than the agent, but that knowledge is implicit. Interrogation creates a convergent pair-working loop: the agent asks pointed questions until the real constraints, vocabulary, edge cases, actors, workflows, and success conditions are visible enough to act without pretending.

Interrogate the domain before committing to a solution.

Rules:

- Start by naming the domain, apparent objective, and highest-risk unknowns.
- Ask questions that materially change the answer, design, model, implementation, or recommendation.
- Prefer concrete questions about actors, workflows, state, examples, edge cases, failure modes, constraints, and what correct means.
- Ask in focused batches. Each batch should be small enough to answer but dense enough to move the domain model forward.
- Continue the loop: ask, synthesize the answers, expose the next uncertainty, and ask again until the model is stable enough to proceed.
- Do not ask generic discovery questions when a sharper question is available.
- Challenge contradictions, vague terms, overloaded words, missing actors, hidden assumptions, and hand-waved success criteria directly.
- Preserve the user's terminology when it carries domain meaning, but translate it into a clearer working model.
- Separate confirmed facts from assumptions, guesses, preferences, and open questions.
- Stop interrogating when the remaining uncertainty is low enough for the requested work.
- Before proceeding, state the working model and unresolved assumptions.

Output:

1. Question Batch: the next focused questions to answer.
2. Running Model: actors, objects, workflows, states, vocabulary, and relationships learned so far.
3. Constraints: rules, invariants, exclusions, risks, and edge cases.
4. Working Assumptions: what the agent will assume if not corrected.
5. Ready-To-Proceed Brief: the concise brief to use for implementation, design, writing, planning, or advice.
