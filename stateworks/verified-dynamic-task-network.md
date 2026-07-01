# VDTN v0: Verified Dynamic Task Network

A **Verified Dynamic Task Network** is a lightweight execution model for agentic engineering work.

The goal is to turn high-level instructions into a task network that can be executed, verified, committed, repaired, or replanned.

---

## 1. Core Model

A VDTN is:

$$
\mathcal{N} = \langle T, E, G, I, S, X, H \rangle
$$

Where:

- $T$ = set of tasks
- $E \subseteq T \times T$ = dependency edges
- $G(S, X)$ = goal predicate
- $I(S, X)$ = global invariant
- $S$ = current project/world state
- $X$ = external operator-owned state
- $H$ = execution history and evidence log

A dependency edge:

$$
u \rightarrow v
$$

means:

> Task $v$ may execute only after task $u$ has been successfully verified and committed.

---

## 2. Task Schema

Each task is represented as:

```yaml
id: T1
title: Short task name
type: compound | primitive | verification | human_gate | human_action
owner: agent | human
surface: repo | database | aws | github | dns | sentry | local_secret_store | other
agent_can_verify: true | false

description: >
  What this task is supposed to accomplish.

deps:
  - T0

reads:
  - files, APIs, configs, docs, database tables, contracts

writes:
  - files, configs, schemas, generated artifacts

preconditions:
  - Conditions that must be true before the task starts.

action:
  - What the agent or human should do.

human_instructions:
  - Exact commands, UI path, or manual steps if owner is human.

postconditions:
  - Conditions that should be true after the task finishes.

expected_external_state:
  - What should be true in an external system after completion.

verifier:
  - How to check the task actually succeeded.

rollback:
  - How to undo, compensate, or isolate failure.

secret_handling:
  - none | never_show_agent | env_file_only | github_secret | local_only

status: pending | ready | running | proposed | committed | failed | blocked | invalidated

evidence:
  - test output
  - diff summary
  - logs
  - screenshots
  - human approval
  - external-state proof
```

---

## 3. Task Types

### Compound Task

A high-level task that must be decomposed.

Example:

```yaml
id: C1
title: Harden API security
type: compound
decomposes_into:
  - T1
  - T2
  - T3
```

### Primitive Task

An executable task.

Example:

```yaml
id: T1
title: Add CSRF protection
type: primitive
```

### Verification Task

A task whose main purpose is checking correctness.

Example:

```yaml
id: V1
title: Run security regression tests
type: verification
```

### Human Gate

A task that requires human approval before proceeding.

Example:

```yaml
id: H1
title: Approve production deployment
type: human_gate
```

### Human Action

A task where a human must change operator-owned external state.

This is different from approval. The human is not merely saying "yes"; they are creating or changing something outside the repo.

Examples:

- Add a GitHub Actions secret.
- Attach a Lightsail instance to an object storage bucket.
- Verify an SSH host key fingerprint.
- Rotate a production credential.
- Enroll MFA and store recovery codes offline.

```yaml
id: H2
title: Attach Lightsail instance to backup bucket
type: human_action
owner: human
surface: aws
agent_can_verify: true
human_instructions:
  - Open Lightsail Storage.
  - Select the production backup bucket.
  - Attach the production instance under resource access.
expected_external_state:
  - The instance role can write encrypted database backups to the bucket.
verifier:
  - Run one backup command.
  - Confirm the object exists in the bucket.
secret_handling:
  - none
```

---

## 4. Readiness Rule

A task is ready when all dependencies are committed and its preconditions hold.

$$
Ready(t) \iff status(t)=pending \land \forall u \in deps(t),\ committed(u) \land P_t(S, X)
$$

In plain English:

> A task can run only when its required predecessors are done, verified, and committed.

---

## 5. Parallel Compatibility Rule

Two tasks can run in parallel only if they are unordered and do not conflict on reads/writes.

$$
Compatible(a,b) \iff
a \not\prec b
\land
b \not\prec a
\land
W_a \cap (R_b \cup W_b) = \varnothing
\land
W_b \cap R_a = \varnothing
$$

Where:

- $R_t$ = resources task $t$ reads
- $W_t$ = resources task $t$ writes

In plain English:

> Two tasks are parallel-safe only if neither depends on the other and neither writes something the other reads or writes.

---

## 6. Execution Batch

At each step, choose a compatible subset of ready tasks.

$$
B \subseteq Ready
$$

such that:

$$
\forall a,b \in B,\ a \neq b \Rightarrow Compatible(a,b)
$$

The old “matrix row” idea is now just one possible batch:

```text
Wave 0: [T1, T2, T3]
Wave 1: [T4, T5]
Wave 2: [V1]
Wave 3: [H1]
```

But the real structure is the dependency graph, not the matrix.

---

## 7. Commit Invariant

At all times, committed work must be verified and globally safe.

$$
Inv(S, X) \equiv
I(S, X)
\land
\forall t,\ committed(t) \Rightarrow Verified(t)
\land
\forall t,\ committed(t) \Rightarrow DepsCommitted(t)
$$

In plain English:

> The project must remain globally valid, and every committed task must have verified evidence.

---

## 8. Execution Loop

```text
while not G(S):

    1. Decompose compound tasks if needed.

    2. Find all ready tasks:
       - dependencies committed
       - preconditions satisfied
       - inputs not invalidated
       - required external state exists

    3. Select a compatible batch:
       - no dependency conflicts
       - no read/write conflicts
       - no unsafe external side effects

    4. Execute batch in isolation.

    5. For each result:
       - verify postconditions
       - verify external state when applicable
       - check evidence
       - check global invariant

    6. If valid:
       - commit result
       - update state S
       - update external state X if the task changed it
       - append evidence to H

    7. If invalid:
       - reject result
       - rollback, retry, repair, or replan

    8. Invalidate downstream tasks if their inputs changed.

return success only if G(S, X) and I(S, X) both hold
```

---

## 9. Failure Handling

A task failure can trigger one of four outcomes:

```text
retry       -> try the same task again
repair      -> insert a new task that fixes the blocker
rollback    -> undo or isolate the failed result
replan      -> replace the affected subgraph
```

Failure should not automatically poison the whole plan.

Only the affected subgraph should be repaired unless the global invariant is broken.

---

## 10. Minimal Example

Goal:

```yaml
goal: Harden a Node/Express API security baseline.
```

Goal predicate:

$$
G(S) = \text{security middleware exists} \land \text{tests pass} \land \text{human approval received}
$$

Global invariant:

```yaml
invariant:
  - Existing auth behavior must not change unless explicitly declared.
  - Existing tests must continue passing.
  - Production deployment requires a human gate.
```

Task graph:

```yaml
tasks:
  - id: T1
    title: Add secure CORS policy
    type: primitive
    deps: []
    reads:
      - server/app.ts
      - env config
    writes:
      - server/app.ts
      - cors config
    preconditions:
      - Express app entrypoint exists.
    postconditions:
      - CORS allows only approved origins.
      - Credentials policy is explicit.
    verifier:
      - Run CORS behavior checks.
      - Confirm unknown origins are rejected.
    rollback:
      - Revert CORS middleware changes.
    status: pending

  - id: T2
    title: Add CSRF protection
    type: primitive
    deps: []
    reads:
      - auth/session middleware
      - route structure
    writes:
      - csrf middleware
      - protected route config
    preconditions:
      - Session or cookie strategy is known.
    postconditions:
      - Unsafe methods require valid CSRF token.
    verifier:
      - Valid token request passes.
      - Missing token request fails.
    rollback:
      - Remove CSRF middleware/config.
    status: pending

  - id: T3
    title: Add SSRF guardrails
    type: primitive
    deps: []
    reads:
      - outbound HTTP client usage
    writes:
      - URL validation utility
      - outbound request wrapper
    preconditions:
      - Outbound network call sites are identified.
    postconditions:
      - Private IP ranges are blocked.
      - Redirects are bounded.
      - Protocol allowlist exists.
    verifier:
      - Test blocked localhost/private IP requests.
      - Test allowed public HTTPS requests.
    rollback:
      - Revert outbound request wrapper.
    status: pending

  - id: V1
    title: Run security regression suite
    type: verification
    deps:
      - T1
      - T2
      - T3
    reads:
      - test suite
      - server code
    writes:
      - test evidence
    preconditions:
      - Security tasks are committed.
    postconditions:
      - Tests pass.
      - Evidence is recorded.
    verifier:
      - Confirm test output.
    rollback:
      - None.
    status: pending

  - id: H1
    title: Human approval before production
    type: human_gate
    deps:
      - V1
    reads:
      - evidence log
      - diff summary
    writes:
      - approval record
    preconditions:
      - Verification evidence exists.
    postconditions:
      - Human approval recorded.
    verifier:
      - Approval is explicit.
    rollback:
      - Mark approval as absent.
    status: pending
```

Possible first wave:

```text
Wave 0: [T1, T2, T3]
Wave 1: [V1]
Wave 2: [H1]
```

But this wave schedule is valid only if:

$$
Compatible(T1,T2)
\land
Compatible(T1,T3)
\land
Compatible(T2,T3)
$$

If two tasks touch the same middleware file or unstable auth contract, they should not be placed in the same wave.

---

## 11. Practical Rule of Thumb

For v0, every task must answer:

1. What does it need before starting?
2. What does it change?
3. How do we verify it worked?
4. What evidence proves it?
5. What happens if it fails?
6. What downstream tasks depend on it?

If those six fields are missing, the task is not ready for agentic execution.

---

## 12. VDTN v0 Summary

The v0 model is:

```text
goal
→ decomposed task graph
→ ready frontier
→ compatible execution batch
→ isolated execution
→ verification
→ commit
→ repair/replan if needed
```

The main invariant is:

> Never commit unverified work, and never let committed work violate the global invariant.
