# Plans and Modeling References

Files in this directory usually record a design or delivery plan at the time it
was written. They may describe work that is complete, superseded, or only
partially implemented.

Do not use a plan as an operating runbook or assume its status statements are
current. Confirm behavior in code and current status in active Stateworks work.

## Living Exception

[LPMS](./lpms.md) is the repository's rich laundry-production modeling
reference. It remains at this path because durable Stateworks decisions and
historical evidence link to it.

Its role is to explain aggregates, workflows, calculations, and data shape. The
implemented contracts, schema, migrations, and production modules remain the
source of truth for shipped behavior.

## Historical Plans

The remaining files are planning records unless a file explicitly declares a
different status:

- [Authentication plan](./auth-plan.md)
- [AWS CI/CD plan](./aws-ci-cd-plan.md)
- [Production operations hardening plan](./production-ops-hardening-plan.md)
- [Security hardening plan](./security-hardening.md)

Current operational guidance lives in [Devops](../devops.md),
[Observability](../observability.md), [Production migrations](../ops/production-migrations.md),
and the security documentation under `docs/security`.
