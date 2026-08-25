import { describe, expect, it } from 'vitest';
import { decideObservation, shouldReportObservation } from '../src/index.js';

describe('observability policy', () => {
  it('suppresses routine client validation failures', () => {
    const decision = decideObservation({
      kind: 'error',
      source: 'api',
      rail: 'http',
      route: '/pricing',
      error: {
        kind: 'ValidationError',
        code: 'invalid_request',
        status: 400,
      },
    });

    expect(decision).toEqual({
      report: false,
      alert: false,
      reason: 'routine_client_failure',
    });
  });

  it('reports API server failures with the server error counter', () => {
    const observation = {
      kind: 'error',
      source: 'api',
      rail: 'http',
      route: '/pricing',
      error: {
        kind: 'DatabaseError',
        code: 'database_unavailable',
        status: 503,
      },
    } as const;

    expect(shouldReportObservation(observation)).toBe(true);
    expect(decideObservation(observation)).toEqual({
      report: true,
      alert: true,
      logLevel: 'error',
      counter: 'api.server_errors',
      reason: 'server_error',
    });
  });

  it('treats explicit product-critical failures as reportable regardless of status', () => {
    const decision = decideObservation({
      kind: 'error',
      source: 'web',
      rail: 'command',
      operation: 'publish_pricing',
      criticality: 'high',
      productCritical: true,
      error: {
        kind: 'ConflictError',
        code: 'publish_invariant_failed',
        status: 409,
      },
    });

    expect(decision).toEqual({
      report: true,
      alert: true,
      logLevel: 'error',
      counter: 'web.critical_failures',
      reason: 'product_critical_failure',
    });
  });

  it('alerts only repeated security denials from the routine denial stream', () => {
    const routine = decideObservation({
      kind: 'security_event',
      source: 'api',
      name: 'authorization.denied',
      outcome: 'denied',
    });
    const repeated = decideObservation({
      kind: 'security_event',
      source: 'api',
      name: 'authorization.denied',
      outcome: 'denied',
      thresholdReached: true,
    });

    expect(routine.report).toBe(false);
    expect(routine.alert).toBe(false);
    expect(routine.reason).toBe('routine_security_event');
    expect(repeated).toEqual({
      report: false,
      alert: true,
      logLevel: 'warn',
      counter: 'security.authorization_denials',
      reason: 'repeated_security_denial',
    });
  });

  it('counts every webhook authentication denial and alerts only at threshold', () => {
    expect(
      decideObservation({
        kind: 'security_event',
        source: 'api',
        name: 'vendor.webhook_authentication_failed',
        outcome: 'denied',
      }),
    ).toEqual({
      report: false,
      alert: false,
      counter: 'security.webhook_authentication_failures',
      reason: 'routine_security_event',
    });
    expect(
      decideObservation({
        kind: 'security_event',
        source: 'api',
        name: 'vendor.webhook_authentication_failed',
        outcome: 'denied',
        thresholdReached: true,
      }),
    ).toEqual({
      report: false,
      alert: true,
      logLevel: 'warn',
      counter: 'security.webhook_authentication_failures',
      reason: 'repeated_security_denial',
    });
  });

  it('keeps selected security and deployment signals high-signal', () => {
    expect(
      decideObservation({
        kind: 'security_event',
        source: 'api',
        name: 'request.rate_limited',
        outcome: 'denied',
        reason: 'auth_login',
      }),
    ).toEqual({
      report: false,
      alert: true,
      logLevel: 'warn',
      counter: 'security.rate_limits',
      reason: 'selected_security_signal',
    });

    expect(
      decideObservation({
        kind: 'runtime_failure',
        source: 'deployment',
        phase: 'deployment',
      }),
    ).toEqual({
      report: true,
      alert: true,
      logLevel: 'error',
      counter: 'deployment.failures',
      reason: 'deployment_failure',
    });
  });
});
