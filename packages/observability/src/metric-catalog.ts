import type { CounterName } from './counter.js';
import type { MeasurementName } from './measurement.js';

export type MetricName = CounterName | MeasurementName;

export type MetricInstrument = 'counter' | 'gauge' | 'distribution';

export type MetricUnit = 'count' | 'second';

export type MetricAttributeKey =
  | 'runtime'
  | 'method'
  | 'route'
  | 'status'
  | 'operation'
  | 'job'
  | 'outcome'
  | 'error_category'
  | 'event'
  | 'reason'
  | 'source'
  | 'phase'
  | 'type'
  | 'mode'
  | 'kind'
  | 'disposition'
  | 'code'
  | 'target'
  | 'runCompleted';

export type MetricDefinition = Readonly<{
  instrument: MetricInstrument;
  unit: MetricUnit;
  allowedAttributes: readonly MetricAttributeKey[];
  attributeValues?: Readonly<
    Partial<Record<MetricAttributeKey, readonly string[]>>
  >;
}>;

export type MetricCatalog = Readonly<Record<MetricName, MetricDefinition>>;

const runtimeValues = Object.freeze([
  'api',
  'worker',
  'web',
  'processor',
  'control',
]);

const observationOutcomes = Object.freeze(['succeeded', 'denied', 'failed']);
const transactionOutcomes = Object.freeze([
  'committed',
  'expected_rollback',
  'failed',
]);
const workerPassOutcomes = Object.freeze(['busy', 'idle', 'failed']);

export const transactionOperations = Object.freeze([
  'orders.create_order',
  'orders.correct_order',
  'orders.complete_order',
  'orders.cancel_order',
  'orders.release_fulfillment',
  'orders.withdraw_fulfillment',
  'orders.propose_incoming_order',
  'orders.close_incoming_order_source',
  'production.accept_schedule',
  'production.apply_fulfillment_demand',
  'production.advance_stage',
  'production.assign_stage_machines',
  'production.create_schedule',
  'production.manage_batch_membership',
  'production.place_order',
  'production.commit_order_backlog',
  'production.replace_shift_order_selection',
  'production.route_order',
  'production.reconcile_batch_progress',
  'production.start_schedule',
  'identity.complete_mfa_challenge',
  'identity.confirm_mfa_enrollment',
  'identity.regenerate_mfa_recovery_codes',
  'identity.remove_mfa',
  'identity.suspend_workforce_membership',
  'identity.reactivate_workforce_membership',
  'identity.end_workforce_membership',
  'identity.grant_workforce_access',
  'identity.revoke_workforce_access',
] as const);

export type TransactionOperation = (typeof transactionOperations)[number];

export const workerJobNames = Object.freeze([
  'webhook_ingestion',
  'order_outbox',
] as const);

export type WorkerJobName = (typeof workerJobNames)[number];

const orderOutboxJobValues = Object.freeze(['order_outbox'] as const);

const attributes = <const Keys extends readonly MetricAttributeKey[]>(
  ...keys: Keys
): Keys => Object.freeze(keys) as Keys;

const withRuntime = <const Keys extends readonly MetricAttributeKey[]>(
  ...keys: Keys
): readonly ['runtime', ...Keys] => attributes('runtime', ...keys);

const runtimeAttributeValues = Object.freeze({ runtime: runtimeValues });
const workerJobAttributeValues = Object.freeze({
  runtime: runtimeValues,
  job: workerJobNames,
});

/**
 * The deployment-neutral metric contract. Runtime adapters use this catalog
 * to choose the instrument and unit and to discard undeclared attributes.
 * Producers remain responsible for supplying stable, bounded values for
 * attributes whose complete vocabulary is owned by an application or module.
 */
export const metricCatalog = Object.freeze({
  'security.login_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('event', 'outcome', 'reason'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      outcome: observationOutcomes,
    }),
  },
  'security.authorization_denials': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('event', 'outcome', 'reason'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      outcome: observationOutcomes,
    }),
  },
  'security.webhook_authentication_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('event', 'outcome', 'reason'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      outcome: observationOutcomes,
    }),
  },
  'security.rate_limits': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('event', 'outcome', 'reason'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      outcome: observationOutcomes,
    }),
  },
  'security.critical_events': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('event', 'outcome', 'reason'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      outcome: observationOutcomes,
    }),
  },
  'api.server_errors': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime(
      'operation',
      'route',
      'status',
      'phase',
      'reason',
      'error_category',
    ),
    attributeValues: runtimeAttributeValues,
  },
  'web.critical_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime(
      'operation',
      'route',
      'status',
      'reason',
      'error_category',
    ),
    attributeValues: runtimeAttributeValues,
  },
  'product.critical_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime(
      'operation',
      'status',
      'reason',
      'error_category',
    ),
    attributeValues: runtimeAttributeValues,
  },
  'worker.jobs_completed': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('job', 'source'),
    attributeValues: workerJobAttributeValues,
  },
  'worker.jobs_retried': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('job', 'source', 'code', 'error_category'),
    attributeValues: workerJobAttributeValues,
  },
  'worker.jobs_failed': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime(
      'job',
      'source',
      'outcome',
      'code',
      'error_category',
    ),
    attributeValues: workerJobAttributeValues,
  },
  'worker.inbox_receipts': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('source'),
    attributeValues: runtimeAttributeValues,
  },
  'worker.dead_letters': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('job', 'source', 'code', 'error_category'),
    attributeValues: workerJobAttributeValues,
  },
  'worker.leases_recovered': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('job'),
    attributeValues: workerJobAttributeValues,
  },
  'worker.lease_losses': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('job', 'disposition'),
    attributeValues: workerJobAttributeValues,
  },
  'worker.loop_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('operation', 'error_category'),
    attributeValues: runtimeAttributeValues,
  },
  'api.command_conflicts': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('route', 'operation'),
    attributeValues: runtimeAttributeValues,
  },
  'api.http_requests': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('method', 'route', 'status', 'outcome'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      method: Object.freeze([
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'HEAD',
        'OPTIONS',
      ]),
      status: Object.freeze(['1xx', '2xx', '3xx', '4xx', '5xx']),
      outcome: Object.freeze(['completed', 'aborted']),
    }),
  },
  'api.webhook_rejections': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('source', 'reason', 'status'),
    attributeValues: runtimeAttributeValues,
  },
  'api.sse_connections': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('outcome'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      outcome: Object.freeze(['opened', 'closed']),
    }),
  },
  'api.sse_events': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('type'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      type: Object.freeze(['ready', 'change', 'resync']),
    }),
  },
  'api.sse_resyncs': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('reason'),
    attributeValues: runtimeAttributeValues,
  },
  'api.sse_feed_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('operation', 'reason', 'error_category'),
    attributeValues: runtimeAttributeValues,
  },
  'product.invariant_failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('route', 'operation', 'error_category'),
    attributeValues: runtimeAttributeValues,
  },
  'production.plan_supersessions': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('operation'),
    attributeValues: runtimeAttributeValues,
  },
  'production.runs_started': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime(),
    attributeValues: runtimeAttributeValues,
  },
  'production.placement_outcomes': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('status', 'mode', 'reason'),
    attributeValues: runtimeAttributeValues,
  },
  'production.queue_conflicts': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('operation'),
    attributeValues: runtimeAttributeValues,
  },
  'production.batch_freezes': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('source'),
    attributeValues: runtimeAttributeValues,
  },
  'production.overtime_confirmations': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('status'),
    attributeValues: runtimeAttributeValues,
  },
  'production.order_route_outcomes': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('operation', 'status', 'kind', 'reason'),
    attributeValues: runtimeAttributeValues,
  },
  'production.progress_reconciliations': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('target', 'runCompleted'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      runCompleted: Object.freeze(['true', 'false']),
    }),
  },
  'db.transactions': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('operation', 'outcome'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      operation: transactionOperations,
      outcome: transactionOutcomes,
    }),
  },
  'worker.job_passes': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('job', 'outcome'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      job: workerJobNames,
      outcome: workerPassOutcomes,
    }),
  },
  'deployment.failures': {
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: withRuntime('phase', 'operation', 'reason'),
    attributeValues: runtimeAttributeValues,
  },
  'api.http_request_duration_seconds': {
    instrument: 'distribution',
    unit: 'second',
    allowedAttributes: withRuntime('method', 'route', 'status', 'outcome'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      method: Object.freeze([
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'HEAD',
        'OPTIONS',
      ]),
      status: Object.freeze(['1xx', '2xx', '3xx', '4xx', '5xx']),
      outcome: Object.freeze(['completed', 'aborted']),
    }),
  },
  'api.sse_active_connections': {
    instrument: 'gauge',
    unit: 'count',
    allowedAttributes: withRuntime(),
    attributeValues: runtimeAttributeValues,
  },
  'worker.inbox_oldest_pending_age_seconds': {
    instrument: 'gauge',
    unit: 'second',
    allowedAttributes: withRuntime('job'),
    attributeValues: workerJobAttributeValues,
  },
  'worker.inbox_pending_count': {
    instrument: 'gauge',
    unit: 'count',
    allowedAttributes: withRuntime('job'),
    attributeValues: workerJobAttributeValues,
  },
  'worker.processing_latency_seconds': {
    instrument: 'distribution',
    unit: 'second',
    allowedAttributes: withRuntime('job', 'source'),
    attributeValues: workerJobAttributeValues,
  },
  'db.transaction_duration_seconds': {
    instrument: 'distribution',
    unit: 'second',
    allowedAttributes: withRuntime('operation', 'outcome'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      operation: transactionOperations,
      outcome: transactionOutcomes,
    }),
  },
  'worker.job_pass_duration_seconds': {
    instrument: 'distribution',
    unit: 'second',
    allowedAttributes: withRuntime('job', 'outcome'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      job: workerJobNames,
      outcome: workerPassOutcomes,
    }),
  },
  'worker.outbox_pending_count': {
    instrument: 'gauge',
    unit: 'count',
    allowedAttributes: withRuntime('job'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      job: orderOutboxJobValues,
    }),
  },
  'worker.outbox_oldest_pending_age_seconds': {
    instrument: 'gauge',
    unit: 'second',
    allowedAttributes: withRuntime('job'),
    attributeValues: Object.freeze({
      runtime: runtimeValues,
      job: orderOutboxJobValues,
    }),
  },
} as const satisfies MetricCatalog);
