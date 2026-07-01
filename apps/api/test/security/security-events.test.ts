import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@pressly/logging';
import type { CounterSink } from '@pressly/metrics';
import { makeSecurityEventSink } from '../../src/common/logging/security-events.ts';

describe('security event sink', () => {
  it('suppresses routine singleton security events', () => {
    const info = vi.fn();
    const logger: Logger = {
      child: () => logger,
      debug: vi.fn(),
      info,
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    };
    const increment = vi.fn();
    const counters: CounterSink = { increment };
    const sink = makeSecurityEventSink({ logger, counters });
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

    expect(info).not.toHaveBeenCalled();
    expect(increment).not.toHaveBeenCalled();
  });

  it('alerts once when repeated denials cross the threshold', () => {
    const warn = vi.fn();
    const logger: Logger = {
      child: () => logger,
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
      fatal: vi.fn(),
    };
    const sink = makeSecurityEventSink({
      logger,
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
    expect(warn).not.toHaveBeenCalled();
    sink.emit(event);
    sink.emit(event);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'security.alert',
      expect.objectContaining({ event: 'authorization.denied' }),
    );
  });

  it('alerts auth login rate limits without logging generic rate limits', () => {
    const warn = vi.fn();
    const increment = vi.fn();
    const logger: Logger = {
      child: () => logger,
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
      fatal: vi.fn(),
    };
    const sink = makeSecurityEventSink({
      logger,
      counters: { increment },
    });

    sink.emit({
      name: 'request.rate_limited',
      occurredAt: '2026-06-29T12:00:00.000Z',
      outcome: 'denied',
      reason: 'api_global',
    });
    expect(warn).not.toHaveBeenCalled();
    expect(increment).not.toHaveBeenCalled();

    sink.emit({
      name: 'request.rate_limited',
      occurredAt: '2026-06-29T12:00:00.000Z',
      outcome: 'denied',
      reason: 'auth_login',
    });

    expect(warn).toHaveBeenCalledWith(
      'security.alert',
      expect.objectContaining({
        event: 'request.rate_limited',
        reason: 'auth_login',
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
    const warn = vi.fn();
    const logger: Logger = {
      child: () => logger,
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
      fatal: vi.fn(),
    };
    const sink = makeSecurityEventSink({
      logger,
      counters: { increment: vi.fn() },
    });

    sink.emit({
      name,
      occurredAt: '2026-06-29T12:00:00.000Z',
      outcome: 'failed',
      principalId: 'principal-1',
    });

    expect(warn).toHaveBeenCalledWith(
      'security.alert',
      expect.objectContaining({ event: name }),
    );
  });
});
