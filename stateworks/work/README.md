# Work Queue

`stateworks/work/` holds project execution state.

Stateworks defines the format.
This directory holds actual Pressly work.
Durable domain facts belong in `stateworks/memory/`, not in work evidence alone.

## Folders

- `queued/`: planned work that has not started.
- `active/`: work currently being executed.
- `done/`: completed work with final report and evidence.
- `archived/`: historical plans kept for context.

## Work Item Shape

```text
<work-id>/
  network.yaml
  brief.md
```

When active, copy the work item to `active/<work-id>/` and add:

```text
state.yaml
evidence.md
human-actions.md
final-report.md
```

## Rule

Do not mark work done because code changed.
Mark it done only after verification and evidence exist.
If work changes what agents should believe about a domain, record a verified
memory delta before relying on that belief in later work.
