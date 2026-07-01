# Stateworks

Stateworks is a lightweight execution system for agentic engineering work.

It is intentionally file-based:

- Humans can read and edit the plan.
- Agents can parse the plan.
- Verification leaves evidence beside the work.
- Manual cloud, GitHub, DNS, Sentry, and secret tasks are explicit.

It is not a workflow engine.

## Directory Model

```text
stateworks/
  verified-dynamic-task-network.md

  schemas/
    network.schema.json
    task.schema.json

  templates/
    network.yaml
    task.yaml
    human-action.yaml
    evidence.md
    final-report.md

  examples/
    security-hardening.network.yaml

  tooling/
    model.ts
    validate-network.ts
    next-batch.ts
    verify.ts
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
plan
-> validate network
-> find ready tasks
-> execute compatible batch
-> verify
-> repair or replan if needed
-> update evidence
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

## Rules

- A task is not complete until its verifier passes or its external state is proven.
- Human actions are tasks, not appendix notes.
- Evidence must be concrete: command, exit status, timestamp, output summary, screenshot path, or external proof.
- Parallel tasks must not write the same files, configs, database objects, or external control-plane state.
- Risky tasks need rollback, compensation, or isolation instructions.
- Commits should map to verified work units.
