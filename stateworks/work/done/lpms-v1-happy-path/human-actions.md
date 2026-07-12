# Human Actions

## Current Requirement

No human action is required to implement and locally verify the LPMS v1 happy
path.

## Not Authorized By This Work

- Production deployment.
- Live Cents credentials or secret creation.
- Changes to Cents account configuration.
- Destructive changes to shared or production databases.
- Approval of exception-state behavior.

## If Live Vendor Proof Becomes Necessary

Stop and add an explicit Stateworks human action before requesting:

- The authoritative Cents webhook authentication contract.
- Redacted representative payload metadata.
- Reconciliation API access and rate-limit details.
- Secret placement in the approved external store.

Never paste credentials, raw customer payloads, bearer tokens, signing secrets,
or production connection strings into Stateworks files or agent messages.
