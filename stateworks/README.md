# Stateworks

Stateworks is a lightweight execution system for agentic engineering work.

It is intentionally file-based:

- Humans can read and edit the plan.
- Agents can parse the plan.
- Verification leaves evidence beside the work.
- Manual cloud, GitHub, DNS, Sentry, and secret tasks are explicit.
- Durable domain memory stays typed, source-backed, and reviewable.

It is not a workflow engine.

```text
Stateworks = verified task execution + durable domain memory
```

## Directory Model

```text
stateworks/
  verified-dynamic-task-network.md

  memory/
    index.yaml

    domains/
      <domain-id>/
        memory.yaml
        context-pack.md

        sessions/
          <yyyy-mm-dd>-<topic>.md

        deltas/
          <yyyy-mm-dd>-<topic>.memory-delta.yaml

  schemas/
    network.schema.json
    task.schema.json
    memory.schema.json
    memory-delta.schema.json

  templates/
    network.yaml
    task.yaml
    human-action.yaml
    evidence.md
    final-report.md
    domain-memory.yaml
    memory-delta.yaml
    interrogation-session.md
    context-pack.md

  examples/
    security-hardening.network.yaml

  tooling/
    model.ts
    validate-network.ts
    next-batch.ts
    verify.ts
    validate-memory.ts
    build-context-pack.ts
    apply-memory-delta.ts
```

Actual project work lives in `stateworks/work/`:

```text
stateworks/work/
  queued/
    <work-id>/
      network.yaml
      brief.md

  active/
    <work-id>/
      network.yaml
      state.yaml
      evidence.md
      human-actions.md
      final-report.md

  done/
  archived/
```

## Execution Loop

```text
load memory index
-> select relevant domain memory
-> build bounded context pack
-> plan
-> validate network
-> find ready tasks
-> execute compatible batch
-> verify
-> commit task evidence/state
-> apply verified memory deltas
-> repair or replan if needed
-> stop on done, blocked human action, destructive change, or repeated failure
```

Default guardrails:

```yaml
max_repair_attempts: 3
stop_on:
  - human_action_required
  - destructive_change_required
  - repeated_verifier_failure
  - invariant_violation
```

## Commands

Validate a network:

```bash
pnpm stateworks:validate stateworks/work/queued/<work-id>/network.yaml
```

Show the next compatible batch:

```bash
pnpm stateworks:next stateworks/work/queued/<work-id>/network.yaml
```

Verify lifecycle state:

```bash
pnpm stateworks:verify stateworks/work/queued/<work-id>/network.yaml
```

Use `--state <path>` when a work item is active and has a separate `state.yaml`.

Validate a domain memory file:

```bash
pnpm stateworks:memory:validate stateworks/memory/domains/<domain-id>/memory.yaml
```

Build a bounded context pack:

```bash
pnpm stateworks:memory:context <domain-id>
```

Apply a verified memory delta:

```bash
pnpm stateworks:memory:apply stateworks/memory/domains/<domain-id>/deltas/<delta>.memory-delta.yaml
```

## Rules

- A task is not complete until its verifier passes or its external state is proven.
- Human actions are tasks, not appendix notes.
- Evidence must be concrete: command, exit status, timestamp, output summary, screenshot path, or external proof.
- Parallel tasks must not write the same files, configs, database objects, or external control-plane state.
- Risky tasks need rollback, compensation, or isolation instructions.
- Commits should map to verified work units.
- Memory updates should be proposed as deltas, verified, then applied.
- Context packs should stay bounded and should not include deprecated memory by default.
- Secrets do not belong in memory, sessions, deltas, context packs, or evidence.
