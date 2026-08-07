# Human Actions and Release Follow-ups

No human action is required to close implementation, local proof, or the
server-side staging observability proof.

Release follow-ups, not blockers for this work package:

- deploy the browser surface to staging and prove source-map symbolication;
- after the real Worker deployment sustains `pressly-worker-progress`, enable
  that monitor and retire the old API-owned heartbeat monitor;
- configure Slack/GitHub integrations and account 2FA if desired; and
- authorize production deployment and the operating pilot separately.
