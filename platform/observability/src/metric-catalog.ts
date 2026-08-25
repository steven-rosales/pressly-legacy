import { defineMetricDescriptors } from './metric-catalog-algebra.js';

const observationOutcomes = Object.freeze(['succeeded', 'denied', 'failed']);
const transactionOutcomes = Object.freeze([
  'committed',
  'expected_rollback',
  'failed',
]);
const workerPassOutcomes = Object.freeze(['busy', 'idle', 'failed']);
const httpMethods = Object.freeze([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);
const httpStatuses = Object.freeze(['1xx', '2xx', '3xx', '4xx', '5xx']);
const httpOutcomes = Object.freeze(['completed', 'aborted']);

/**
 * Deployment-neutral metric mechanisms. Business counters and bounded owner
 * vocabularies are composed with these descriptors by checked topology
 * generation rather than being centralized in this package.
 */
export const genericMetricDescriptors = defineMetricDescriptors(
  {
    name: 'security.login_failures',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'event', 'outcome', 'reason'],
    attributeValues: { outcome: observationOutcomes },
  },
  {
    name: 'security.authorization_denials',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'event', 'outcome', 'reason'],
    attributeValues: { outcome: observationOutcomes },
  },
  {
    name: 'security.webhook_authentication_failures',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'event', 'outcome', 'reason'],
    attributeValues: { outcome: observationOutcomes },
  },
  {
    name: 'security.rate_limits',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'event', 'outcome', 'reason'],
    attributeValues: { outcome: observationOutcomes },
  },
  {
    name: 'security.critical_events',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'event', 'outcome', 'reason'],
    attributeValues: { outcome: observationOutcomes },
  },
  {
    name: 'api.server_errors',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'operation',
      'route',
      'status',
      'phase',
      'reason',
      'error_category',
    ],
  },
  {
    name: 'web.critical_failures',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'operation',
      'route',
      'status',
      'reason',
      'error_category',
    ],
  },
  {
    name: 'product.critical_failures',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'operation',
      'status',
      'reason',
      'error_category',
    ],
  },
  {
    name: 'worker.jobs_completed',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'job', 'source'],
  },
  {
    name: 'worker.jobs_retried',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'job', 'source', 'code', 'error_category'],
  },
  {
    name: 'worker.jobs_failed',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: [
      'runtime',
      'job',
      'source',
      'outcome',
      'code',
      'error_category',
    ],
  },
  {
    name: 'worker.dead_letters',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'job', 'source', 'code', 'error_category'],
  },
  {
    name: 'worker.leases_recovered',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'job'],
  },
  {
    name: 'worker.lease_losses',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'job', 'disposition'],
  },
  {
    name: 'worker.loop_failures',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'operation', 'error_category'],
  },
  {
    name: 'api.command_conflicts',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'route', 'operation'],
  },
  {
    name: 'api.http_requests',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'method', 'route', 'status', 'outcome'],
    attributeValues: {
      method: httpMethods,
      status: httpStatuses,
      outcome: httpOutcomes,
    },
  },
  {
    name: 'api.sse_connections',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'outcome'],
    attributeValues: { outcome: ['opened', 'closed'] },
  },
  {
    name: 'api.sse_events',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'type'],
    attributeValues: { type: ['ready', 'change', 'resync'] },
  },
  {
    name: 'api.sse_failures',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'reason'],
    attributeValues: {
      reason: ['invalid_frame', 'session_close', 'source_error', 'write_error'],
    },
  },
  {
    name: 'api.sse_resyncs',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'reason'],
  },
  {
    name: 'api.sse_feed_failures',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'operation', 'reason', 'error_category'],
  },
  {
    name: 'product.invariant_failures',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'route', 'operation', 'error_category'],
  },
  {
    name: 'db.transactions',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'operation', 'outcome'],
    attributeValues: { outcome: transactionOutcomes },
  },
  {
    name: 'worker.job_passes',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'job', 'outcome'],
    attributeValues: { outcome: workerPassOutcomes },
  },
  {
    name: 'deployment.failures',
    instrument: 'counter',
    unit: 'count',
    allowedAttributes: ['runtime', 'phase', 'operation', 'reason'],
  },
  {
    name: 'api.http_request_duration_seconds',
    instrument: 'distribution',
    unit: 'second',
    allowedAttributes: ['runtime', 'method', 'route', 'status', 'outcome'],
    attributeValues: {
      method: httpMethods,
      status: httpStatuses,
      outcome: httpOutcomes,
    },
  },
  {
    name: 'api.sse_active_connections',
    instrument: 'gauge',
    unit: 'count',
    allowedAttributes: ['runtime'],
  },
  {
    name: 'db.transaction_duration_seconds',
    instrument: 'distribution',
    unit: 'second',
    allowedAttributes: ['runtime', 'operation', 'outcome'],
    attributeValues: { outcome: transactionOutcomes },
  },
  {
    name: 'worker.job_pass_duration_seconds',
    instrument: 'distribution',
    unit: 'second',
    allowedAttributes: ['runtime', 'job', 'outcome'],
    attributeValues: { outcome: workerPassOutcomes },
  },
  {
    name: 'worker.outbox_pending_count',
    instrument: 'gauge',
    unit: 'count',
    allowedAttributes: ['runtime', 'job'],
  },
  {
    name: 'worker.outbox_oldest_pending_age_seconds',
    instrument: 'gauge',
    unit: 'second',
    allowedAttributes: ['runtime', 'job'],
  },
);

export type GenericMetricDescriptor = (typeof genericMetricDescriptors)[number];
export type GenericMetricName = GenericMetricDescriptor['name'];
