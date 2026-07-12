import type { CounterName } from './counter.js';

export type ObservationSource = 'api' | 'web' | 'worker' | 'deployment';

export type ObservationRail =
  | 'http'
  | 'command'
  | 'query'
  | 'render'
  | 'global'
  | 'startup'
  | 'server'
  | 'deployment'
  | 'security';

export type ObservationCriticality = 'low' | 'medium' | 'high';

export type ObservationLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type ObservationErrorShape = Readonly<{
  kind?: string | undefined;
  code?: string | undefined;
  status?: number | undefined;
  traceId?: string | undefined;
}>;

export type ErrorObservation = Readonly<{
  kind: 'error';
  source: ObservationSource;
  rail: ObservationRail;
  operation?: string | undefined;
  route?: string | undefined;
  criticality?: ObservationCriticality | undefined;
  productCritical?: boolean | undefined;
  error: ObservationErrorShape;
}>;

export type RuntimeFailureObservation = Readonly<{
  kind: 'runtime_failure';
  source: ObservationSource;
  phase: 'startup' | 'server' | 'deployment';
  operation?: string | undefined;
  error?: ObservationErrorShape | undefined;
}>;

export type SecurityObservation = Readonly<{
  kind: 'security_event';
  source: ObservationSource;
  name: string;
  outcome: 'succeeded' | 'denied' | 'failed';
  reason?: string | undefined;
  thresholdReached?: boolean | undefined;
}>;

export type Observation =
  | ErrorObservation
  | RuntimeFailureObservation
  | SecurityObservation;

export type ObservationDecisionReason =
  | 'server_error'
  | 'product_critical_failure'
  | 'startup_failure'
  | 'deployment_failure'
  | 'selected_security_signal'
  | 'repeated_security_denial'
  | 'routine_client_failure'
  | 'routine_security_event';

export type ObservationDecision = Readonly<{
  report: boolean;
  alert: boolean;
  logLevel?: ObservationLogLevel | undefined;
  counter?: CounterName | undefined;
  reason: ObservationDecisionReason;
}>;

const serverErrorStatus = (status: number | undefined): boolean =>
  status === undefined || status >= 500;

const clientFailureStatus = (status: number | undefined): boolean =>
  status !== undefined && status >= 400 && status < 500;

const sourceFailureCounter = (
  source: ObservationSource,
): CounterName | undefined => {
  if (source === 'api') return 'api.server_errors';
  if (source === 'web') return 'web.critical_failures';
  return undefined;
};

const productCriticalCounter = (
  source: ObservationSource,
): CounterName | undefined =>
  source === 'web' ? 'web.critical_failures' : 'product.critical_failures';

const decideErrorObservation = (
  observation: ErrorObservation,
): ObservationDecision => {
  if (observation.productCritical === true)
    return {
      report: true,
      alert: true,
      logLevel: 'error',
      counter: productCriticalCounter(observation.source),
      reason: 'product_critical_failure',
    };

  if (serverErrorStatus(observation.error.status))
    return {
      report: true,
      alert: true,
      logLevel: 'error',
      counter: sourceFailureCounter(observation.source),
      reason: 'server_error',
    };

  if (clientFailureStatus(observation.error.status))
    return {
      report: false,
      alert: false,
      reason: 'routine_client_failure',
    };

  return {
    report: true,
    alert: true,
    logLevel: 'error',
    counter: sourceFailureCounter(observation.source),
    reason: 'server_error',
  };
};

const decideRuntimeFailureObservation = (
  observation: RuntimeFailureObservation,
): ObservationDecision => {
  if (observation.phase === 'deployment')
    return {
      report: true,
      alert: true,
      logLevel: 'error',
      counter: 'deployment.failures',
      reason: 'deployment_failure',
    };

  return {
    report: true,
    alert: true,
    logLevel: observation.phase === 'startup' ? 'fatal' : 'error',
    counter: sourceFailureCounter(observation.source),
    reason: 'startup_failure',
  };
};

const selectedImmediateSecuritySignals = new Set([
  'authentication.login_rate_limited',
  'deployment.failed',
  'mfa.recovery_used',
  'privileged.mutation',
  'server.error',
]);

const thresholdSecuritySignals = new Set([
  'authentication.login_failed',
  'authorization.denied',
  'vendor.webhook_authentication_failed',
]);

const securityCounter = (
  observation: SecurityObservation,
): CounterName | undefined => {
  if (observation.name === 'deployment.failed') return 'deployment.failures';
  if (observation.name === 'server.error') return 'api.server_errors';
  if (observation.name === 'authentication.login_failed')
    return 'security.login_failures';
  if (observation.name === 'authorization.denied')
    return 'security.authorization_denials';
  if (observation.name === 'vendor.webhook_authentication_failed')
    return 'security.webhook_authentication_failures';
  if (
    observation.name === 'authentication.login_rate_limited' ||
    (observation.name === 'request.rate_limited' &&
      observation.reason === 'auth_login')
  )
    return 'security.rate_limits';
  return 'security.critical_events';
};

const decideSecurityObservation = (
  observation: SecurityObservation,
): ObservationDecision => {
  if (observation.name === 'vendor.webhook_authentication_failed')
    return {
      report: false,
      alert: observation.thresholdReached === true,
      ...(observation.thresholdReached === true
        ? { logLevel: 'warn' as const }
        : {}),
      counter: 'security.webhook_authentication_failures',
      reason:
        observation.thresholdReached === true
          ? 'repeated_security_denial'
          : 'routine_security_event',
    };

  const selected =
    selectedImmediateSecuritySignals.has(observation.name) ||
    (observation.name === 'request.rate_limited' &&
      observation.reason === 'auth_login');

  if (selected)
    return {
      report: false,
      alert: true,
      logLevel:
        observation.name === 'deployment.failed' ||
        observation.name === 'server.error'
          ? 'error'
          : 'warn',
      counter: securityCounter(observation),
      reason: 'selected_security_signal',
    };

  if (
    observation.thresholdReached === true &&
    thresholdSecuritySignals.has(observation.name)
  )
    return {
      report: false,
      alert: true,
      logLevel: 'warn',
      counter: securityCounter(observation),
      reason: 'repeated_security_denial',
    };

  return {
    report: false,
    alert: false,
    reason: 'routine_security_event',
  };
};

export const decideObservation = (
  observation: Observation,
): ObservationDecision => {
  if (observation.kind === 'error') return decideErrorObservation(observation);
  if (observation.kind === 'runtime_failure')
    return decideRuntimeFailureObservation(observation);
  return decideSecurityObservation(observation);
};

export const shouldReportObservation = (observation: Observation): boolean =>
  decideObservation(observation).report;
