# LPMS Production-Order Resolution and Row Identity Human Actions

No human action is currently required for repository implementation.

Hard deletion, production-data cleanup, legal retention, deployment, and pilot
execution remain outside this package. Do not run a backlog commit against
production data without a separately verified operational approval and exact
preview.

## Secret Handling

Do not record credentials, tokens, connection strings, raw source snapshots,
customer names, phone numbers, customer identifiers, or private payloads in
Stateworks evidence, tests, screenshots, or commits. Use synthetic fixtures.
