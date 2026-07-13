export type CounterName =
  | 'security.login_failures'
  | 'security.authorization_denials'
  | 'security.webhook_authentication_failures'
  | 'security.rate_limits'
  | 'security.critical_events'
  | 'api.server_errors'
  | 'web.critical_failures'
  | 'product.critical_failures'
  | 'worker.jobs_completed'
  | 'worker.jobs_retried'
  | 'worker.jobs_failed'
  | 'worker.inbox_receipts'
  | 'worker.dead_letters'
  | 'worker.leases_recovered'
  | 'worker.lease_losses'
  | 'worker.loop_failures'
  | 'worker.reconciliation_drift'
  | 'api.command_conflicts'
  | 'product.invariant_failures'
  | 'deployment.failures';

export type CounterLabels = Readonly<Record<string, string>>;

export type CounterSink = Readonly<{
  increment: (name: CounterName, labels?: CounterLabels) => void;
}>;

export const nullCounterSink: CounterSink = {
  increment: () => undefined,
};
