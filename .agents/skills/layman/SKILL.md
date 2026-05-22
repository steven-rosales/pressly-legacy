---
name: layman
description: >-
  summarize completed technical changes into concise, non-authoritative explainers grounded only in evidence: code, tests, configs, logs, data, requirements, or accepted decisions. use after shipped behavior changes, fixes, boundary changes, or reliability/correctness improvements.
---

Motivation: This skill was created since the agent moves quicker than the human eye, sometimes magnitudes faster. Layman is a way to let the human read quickly about the changes through evidence.

Create or update a plain explainer for one completed change.

Rules:

- Ground every claim in inspected evidence. Do not invent policy, invariants, architecture doctrine, intent, or unresolved rules.
- Update an existing explainer when behavior changes. Create a new one only for a distinct outcome.
- Use concrete nouns and verbs. Avoid hype, speculation, abstraction, and long history.

Output:

1. What Changed: implemented outcome in simple terms.
2. Where: exact files, modules, tables, routes, jobs, tests, configs, or tools.
3. Why: factual pressure behind the change. If the reason is not visible in evidence, echo 'Not shown in inspected evidence'.
4. Effect: practical consequence for users, operators, engineers, or behavior.

This skill can be used with skill $perceptual-fluency.
