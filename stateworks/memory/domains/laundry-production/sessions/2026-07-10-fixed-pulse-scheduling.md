# Fixed-Pulse Scheduling Interrogation

Date: 2026-07-10
Domain: laundry-production
Topic: LPMS v1 pulse computation and operator scheduling directives

## Source

- Conversation with Steven on the manual laundry-production calculation.
- Planning document: `docs/plan/lpms.md`.

## Confirmed Facts

- V1 uses a deterministic heijunka-style scheduler, not a combinatorial optimizer.
- `scheduler_config.pulse_minutes` is configurable. Initial planning uses 56 minutes.
- Sorting, washing, drying, and folding/packaging each reserve one full pulse.
- A batch advances only at a pulse boundary. Early physical completion is operational buffer.
- Pulse capacity is the minimum of effective washer, dryer, and folding capacity.
- Folding capacity per pulse is `fold_lbs_per_folder_minute * effective_folder_count * pulse_minutes`.
- Initial planning uses 2 pounds per effective folder minute and 2 effective folders.
- With a 56-minute pulse, folding capacity is 224 pounds. It is the bottleneck against 674 pounds of washer capacity and 660 pounds of dryer capacity.
- An empty four-stage pipeline has a makespan of `(actual_batch_count + 4 - 1) * pulse_minutes`.
- Ideally packing 800 pounds into four batches takes 392 minutes, or 6 hours 32 minutes.
- Orders have variable bag counts and weights, but a whole order cannot split across production batches.
- An order above pulse capacity is returned as unplaced in v1; it is never silently split.
- Priority means earliest feasible placement subject to eligibility, capacity, and whole-order constraints. It does not guarantee batch one.
- Future-due orders may fill unused capacity only through an explicit operator-selected planning horizon. Their due dates do not change.

## Decisions

- Keep the v1 scheduler deterministic, explainable, and greedy until operational data justifies deeper optimization.
- Deliver the happy path first: API and scheduler, processor integration, then UI.
- Add manual holds, hard-confirmed cancellation, recovery, and exception UX after observing the happy path.

## Assumptions

- Two pounds per effective folder minute is an initial configurable planning estimate, not measured production truth.
- The 800-pound example assumes ideal whole-order packing into four batches. Real order sizes can require more batches.

## Open Questions

- What stable tie-breakers should order equally ranked priority and due-date candidates?
- How should holds, cancellation, rewash, damaged items, and missing bags affect accepted execution?
- When may a schedule intentionally exceed the selected shift window?

## Candidate Memory Deltas

- `2026-07-10-fixed-pulse-scheduling.memory-delta.yaml`
