# Laundry Production Domain Interrogation

Date: 2026-07-08
Domain: laundry-production
Topic: LPMS v1 production policies and invariants

## Source

- Conversation with Steven on LPMS domain behavior.
- Planning document: `docs/plan/lpms.md`.
- External source checked during planning: Cents webhook documentation.
- External source checked during planning: Toyota/Lean heijunka references.

## Confirmed Facts

- Cents is the v1 external order authority.
- A Cents order with latest projected status `IN_PROGRESS` is eligible for LPMS production.
- LPMS production flow is `queued -> sorting -> washing -> drying -> folding_packaging -> finished`.
- The scheduler creates a proposal first. Production execution starts only after a proposal is accepted.
- Orders must stay together in one production batch in v1.
- Orders and bags can split across washers or dryers inside a production batch stage.
- Individual bags are not assigned to machines in v1.
- A production batch is not a washer load.
- A production batch can use many washers or dryers during one stage.
- Stage completion is operator-confirmed operational truth, not hardware sensor truth.
- There is no washer or dryer hardware integration in v1.
- For v1, at most one production batch can be active per stage kind.
- The default production pulse is 56 minutes.
- `batch_minutes` must be at least 50.
- Initial folding capacity is configurable and starts from 1.5 pounds per employee minute.
- Washer scheduling uses effective capacity below manufacturer capacity because overloaded machines caused quality issues.
- Weight is derived from Cents service pricing in v1.
- V1 is scoped to wash-and-fold production only.

## Decisions

- Use `laundry-production` as the durable memory domain id.
- Keep LPMS as the app/system name, not the memory domain id.
- Treat `schedule_run` as immutable scheduler proposal.
- Treat `production_run`, `production_batch`, and `stage_run` as execution truth.
- Treat `stage_run` as the owner of physical workflow state.
- Treat `work_event` as the authoritative mutation ledger and audit trail, not full event sourcing in v1.
- Build the first scheduler in TypeScript behind a boundary that can later be replaced by a Rust solver.
- Keep schema/table detail in `docs/plan/lpms.md`; keep durable business rules in Stateworks memory.

## Assumptions

- Cents price-derived weight is good enough for v1 scheduling.
- Due-date buckets of today, tomorrow, and later are enough for first scheduling behavior.
- Commercial/B2B orders are low enough volume in v1 to stay inside the same basic batching rules.
- Operators can be trusted to confirm stage completion manually.

## Open Questions

- Exact deterministic scheduler ordering rules still need to be defined.
- Exception effects still need to be specified for rewash, canceled orders, damaged items, missing bags, and manual holds.
- Role and permission policy still needs to be mapped onto owner, manager, employee, and admin behavior.
- Production shift boundary rules still need to be defined.
- Replanning behavior after execution drift still needs to be defined.

## Candidate Memory Deltas

- `2026-07-08-core-domain.memory-delta.yaml`
