# Design QA

## Automated interaction evidence

`pnpm --filter @pressly/processor test -- --runInBand` passed 40 files and 254
tests. The submitted-candidate slice includes 13 Incoming-order tests covering:

- recognizable Order and customer identity without vendor lifecycle control;
- Accept and audited Reject;
- source-closed review and manager Restore;
- bounded server pagination and last-item page recovery;
- loading, empty, error, and settled-content behavior; and
- server-owned action availability.

Two generic Sheet tests emitted non-fatal Radix warnings about a missing dialog
description. The suite exited 0, but those warnings are retained as test output
and are not upgraded into browser-console evidence.

## Rendered local evidence

The local schema migrated through `0037`. Current API, Worker, and Processor
images were rebuilt sequentially, only those local services were restarted,
and all became healthy. The rendered pass used the existing authenticated
desktop Chrome session against `http://localhost:4173/orders`; it did not use
production data or services.

Synthetic local candidates exercised the real durable path rather than a
mocked browser fixture:

- exact `SUBMITTED` rendered one Needs review candidate with stable Order,
  customer, contact, provenance, reported time, due time, demand, Reject, and
  Add to Pressly affordances;
- exact `COMPLETED` moved a pending candidate to Closed by Cents with an
  explicit explanation that no Pressly Order was created;
- Restore returned the candidate to Needs review and protected it from later
  source closure;
- Reject required a reason and removed the candidate without canonical work;
  and
- Accept removed the candidate and created a Current order shown as
  `Forecast only`, `Not assigned`, and `Bags not counted`.

The first acceptance-dialog render exposed obsolete copy that promised release
and Needs intake. English, Spanish, and the focused component assertion were
changed to say that acceptance creates unreleased, forecast-only work and
requires an explicit later release. The rebuilt final dialog was inspected
again before this gate committed.

## Layout and interaction evidence

- Normal desktop layout rendered Incoming and Current as distinct workspaces
  with a five-column candidate table and a conventional left-aligned action
  column.
- A 390 by 844 viewport rendered one bounded candidate card with full-width
  44-pixel Reject and Add actions. Document and body width both remained 390
  pixels, proving no horizontal overflow.
- The mobile workspace's internal content scroller reached its end, and the
  mobile order-detail sheet scrolled its full 569-pixel range. Archive,
  customer identity, and close controls remained reachable.
- The mobile navigation drawer contained every workspace without edge
  clipping. Closing it restored focus to Open navigation.
- Canceling an Add decision restored focus to that exact Order's Add button
  after the close animation.
- The accepted canonical detail sheet preserved recognizable customer identity
  and rendered Forecast only, Not assigned, and the complete order facts
  without horizontal overflow.
- The real Chrome console contained zero warnings or errors during the final
  desktop and mobile pass.

No screenshot artifact is promoted as durable product evidence; the exact DOM,
interaction, scroll, focus, overflow, and console observations above are the
verification record.
