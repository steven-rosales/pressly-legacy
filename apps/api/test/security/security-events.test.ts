import { describe, expect, it, vi } from 'vitest';
import type { CounterSink, ErrorReporter } from '@pressly/metrics';
import { makeSecurityEventSink } from '../../src/common/logging/security-events.ts';

const makeAlerts = () => {
  const capture = vi.fn();
  const alerts: ErrorReporter = {
    capture,
    shutdown: async () => undefined,
  };

  return { alerts, capture };
};

describe('security event sink', () => {
  it('suppresses routine singleton security events', () => {
    const { alerts, capture } = makeAlerts();
    const increment = vi.fn();
    const counters: CounterSink = { increment };
    const sink = makeSecurityEventSink({ alerts, counters });
    const event = {
      name: 'authorization.denied',
      occurredAt: '2026-06-29T12:00:00.000Z',
      outcome: 'denied',
      requestId: 'request-1',
      principalId: 'principal-1',
      action: 'pricing:publish',
      resourceType: 'pricing.catalog',
      reason: 'missing_assignment',
    } as const;

    sink.emit(event);

    expect(capture).not.toHaveBeenCalled();
    expect(increment).not.toHaveBeenCalled();
  });

  it('alerts once when repeated denials cross the threshold', () => {
    const { alerts, capture } = makeAlerts();
    const sink = makeSecurityEventSink({
      alerts,
      counters: { increment: vi.fn() },
      alertThreshold: 3,
    });
    const event = {
      name: 'authorization.denied',
      occurredAt: '2026-06-29T12:00:00.000Z',
      outcome: 'denied',
      principalId: 'principal-1',
      action: 'pricing:publish',
      reason: 'missing_assignment',
    } as const;

    sink.emit(event);
    sink.emit(event);
    expect(capture).not.toHaveBeenCalled();
    sink.emit(event);
    sink.emit(event);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'security_alert_authorization_denied',
      }),
      expect.objectContaining({
        source: 'api',
        operation: 'security.authorization.denied',
        actorId: 'principal-1',
        tags: expect.objectContaining({
          security_event: 'authorization.denied',
          reason: 'repeated_security_denial',
        }),
      }),
    );
  });

  it('counts redacted webhook denials and alerts only at the threshold', () => {
    const { alerts, capture } = makeAlerts();
    const increment = vi.fn();
    const sink = makeSecurityEventSink({
      alerts,
      counters: { increment },
      alertThreshold: 3,
    });
    const event = {
      name: 'vendor.webhook_authentication_failed',
      occurredAt: '2026-07-12T16:00:00.000Z',
      outcome: 'denied',
      resourceType: 'http.route',
      resourceId: '/webhooks/cents',
      reason: 'invalid_cents_webhook_authentication',
    } as const;

    sink.emit(event);
    sink.emit(event);
    expect(capture).not.toHaveBeenCalled();
    sink.emit(event);

    expect(increment).toHaveBeenCalledTimes(3);
    expect(increment).toHaveBeenLastCalledWith(
      'security.webhook_authentication_failures',
      {
        event: 'vendor.webhook_authentication_failed',
        outcome: 'denied',
        reason: 'repeated_security_denial',
      },
    );
    expect(capture).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(capture.mock.calls)).not.toMatch(
      /signature|hmac[_-]?key/i,
    );
  });

  it('alerts auth login rate limits without logging generic rate limits', () => {
    const { alerts, capture } = makeAlerts();
    const increment = vi.fn();
    const sink = makeSecurityEventSink({
      alerts,
      counters: { increment },
    });

    sink.emit({
      name: 'request.rate_limited',
      occurredAt: '2026-06-29T12:00:00.000Z',
      outcome: 'denied',
      reason: 'api_global',
    });
    expect(capture).not.toHaveBeenCalled();
    expect(increment).not.toHaveBeenCalled();

    sink.emit({
      name: 'request.rate_limited',
      occurredAt: '2026-06-29T12:00:00.000Z',
      outcome: 'denied',
      reason: 'auth_login',
    });

    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'security_alert_request_rate_limited',
      }),
      expect.objectContaining({
        source: 'api',
        operation: 'security.request.rate_limited',
        tags: expect.objectContaining({
          event_reason: 'auth_login',
          security_event: 'request.rate_limited',
          reason: 'selected_security_signal',
        }),
      }),
    );
    expect(increment).toHaveBeenCalledWith('security.rate_limits', {
      event: 'request.rate_limited',
      outcome: 'denied',
      reason: 'selected_security_signal',
    });
  });

  it.each([
    'mfa.recovery_used',
    'privileged.mutation',
    'deployment.failed',
    'authentication.login_rate_limited',
  ] as const)('alerts immediately for %s', (name) => {
    const { alerts, capture } = makeAlerts();
    const sink = makeSecurityEventSink({
      alerts,
      counters: { increment: vi.fn() },
    });

    sink.emit({
      name,
      occurredAt: '2026-06-29T12:00:00.000Z',
      outcome: 'failed',
      principalId: 'principal-1',
    });

    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        code: `security_alert_${name.replaceAll('.', '_')}`,
      }),
      expect.objectContaining({
        operation: `security.${name}`,
        tags: expect.objectContaining({ security_event: name }),
      }),
    );
  });
});
