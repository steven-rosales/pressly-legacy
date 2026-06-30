import type {
  Logger,
  SecurityEvent,
  SecurityEventSink,
} from '@pressly/logging';
import type { CounterName, CounterSink } from '@pressly/metrics';

const counterForEvent = (event: SecurityEvent): CounterName | undefined => {
  if (
    event.name === 'authentication.login_failed' ||
    event.name === 'authentication.login_rate_limited'
  )
    return 'security.login_failures';
  if (event.name === 'authorization.denied')
    return 'security.authorization_denials';
  if (event.name === 'request.rate_limited') return 'security.rate_limits';
  if (event.name === 'server.error') return 'api.server_errors';
  return undefined;
};

export const makeLogCounterSink = (logger: Logger): CounterSink => ({
  increment: (name, labels) => {
    logger.info('metric.counter', { name, value: 1, ...labels });
  },
});

export const makeSecurityEventSink = (input: {
  logger: Logger;
  counters: CounterSink;
  nowMs?: () => number;
  alertThreshold?: number;
  alertWindowMs?: number;
}): SecurityEventSink => {
  const alertCounts = new Map<string, { count: number; resetAtMs: number }>();
  const nowMs = input.nowMs ?? Date.now;
  const threshold = input.alertThreshold ?? 5;
  const windowMs = input.alertWindowMs ?? 5 * 60_000;

  const shouldAlert = (event: SecurityEvent): boolean => {
    if (
      event.name === 'mfa.recovery_used' ||
      event.name === 'privileged.mutation' ||
      event.name === 'deployment.failed' ||
      event.name === 'authentication.login_rate_limited'
    )
      return true;

    if (
      event.name !== 'authentication.login_failed' &&
      event.name !== 'authorization.denied'
    )
      return false;

    const key = [
      event.name,
      event.principalId ?? 'unknown',
      event.action ?? '',
    ].join(':');
    const now = nowMs();
    const current = alertCounts.get(key);
    const entry =
      current === undefined || current.resetAtMs <= now
        ? { count: 0, resetAtMs: now + windowMs }
        : current;
    entry.count += 1;
    alertCounts.set(key, entry);
    return entry.count === threshold;
  };

  return {
    emit(event) {
      input.logger.info(`security.${event.name}`, { ...event });
      if (shouldAlert(event))
        input.logger.warn('security.alert', {
          event: event.name,
          outcome: event.outcome,
          ...(event.requestId === undefined
            ? {}
            : { requestId: event.requestId }),
          ...(event.principalId === undefined
            ? {}
            : { principalId: event.principalId }),
          ...(event.action === undefined ? {} : { action: event.action }),
          ...(event.reason === undefined ? {} : { reason: event.reason }),
        });

      const counter = counterForEvent(event);
      if (counter !== undefined)
        input.counters.increment(counter, {
          event: event.name,
          outcome: event.outcome,
        });
    },
  };
};
