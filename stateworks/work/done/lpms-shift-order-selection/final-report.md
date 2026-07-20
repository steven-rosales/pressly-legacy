# LPMS Shift Order Selection Final Report

Status: complete locally; not deployed.

LPMS now keeps Cents lifecycle, physical intake, production readiness, and
shift intent as separate server-authoritative facts. Pre-`IN_PROGRESS` orders
remain forecast-only even after intake. An order becomes a ready candidate only
after Cents releases it and intake exists, and it enters a schedule only through
an explicit shift-scoped selection.

Selection is versioned, audited, location-bound, initially empty, and protected
by the scheduling lock. Compute, Accept, and Start operate on the same exact
selected order snapshot. A selection edit supersedes a mutable plan, while a
new unselected arrival leaves an accepted plan intact. After Start, adding an
arrival is an explicit manager command rather than webhook-driven automation.

Processor implements the workflow with the existing ElevenLabs-derived shadcn
language: compact checkboxes, selected totals, bulk actions, precise disabled
states, and complete English and Spanish copy. No new visual system or client
domain policy was introduced.

Verification covers policy, Production unit and Postgres integration,
contracts, database schema, API, Worker, Processor interactions, architecture
boundaries, lint, formatting, and TypeScript. Chrome's extension session was
unavailable, so this report does not claim a manual visual screenshot review.

No environment variable is required. Deployment must apply database migration
`0023_lpms-shift-order-selection.sql`; production deployment remains a separate
authorized action.
