# Security Incident Response

## First Five Minutes

1. Record the alert time, event name, environment, and request ID.
2. Decide whether the event is still active.
3. Preserve logs before restarting or redeploying.
4. Contain the narrowest affected credential, session, route, or release.
5. Choose code rollback or data recovery. They solve different failures.

## Trace One Request

Search structured API logs for the exact request ID:

```bash
docker compose \
  --env-file /opt/pressly/env/compose.env \
  -f /opt/pressly/repo/deploy/aws/lightsail/docker-compose.production.yml \
  logs --since 30m api | rg '<request-id>'
```

Then correlate safe fields:

```text
principalId -> sessionId -> action -> resourceType/resourceId -> outcome/reason
```

Never paste access tokens, passwords, MFA secrets, recovery codes, cookies, or
database URLs into an incident note.

## Containment Choices

```text
compromised session       -> revoke that session
identity compromise       -> revoke all sessions and rotate credentials
authorization anomaly     -> preserve evidence, inspect assignments, then correct
bad application release   -> rollback by recorded image digest
data corruption or loss   -> follow the Postgres restore runbook
```

## Closeout

Record detection time, containment time, recovery time, affected identities or
resources, evidence retained, and one concrete follow-up owner.
