import { unexpectedError } from '@pressly/errors/factories';
import type { SecurityEvent, SecurityEventSink } from '@pressly/logging';
import {
  attemptObservation,
  decideObservation,
  type CounterSink,
  type ErrorReporter,
  type ObservationDecision,
} from '@pressly/observability';
import { systemClock } from '@pressly/time';

const alertCode = (event: SecurityEvent): string =>
  `security_alert_${event.name.replaceAll('.', '_')}`;

const routeFor = (event: SecurityEvent): string | undefined =>
  event.resourceType === 'http.route' ? event.resourceId : undefined;

const captureSecurityAlert = (
  alerts: ErrorReporter,
  event: SecurityEvent,
  decision: ObservationDecision,
): void => {
  alerts.capture(
    unexpectedError({
      code: alertCode(event),
      message: `Security alert observed: ${event.name}.`,
      safeMessage: 'Security alert observed.',
      details: {
        event: event.name,
        outcome: event.outcome,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        reason: event.reason,
      },
    }),
    {
      source: 'api',
      operation: `security.${event.name}`,
      ...(event.requestId === undefined ? {} : { requestId: event.requestId }),
      ...(event.principalId === undefined
        ? {}
        : { actorId: event.principalId }),
      ...(routeFor(event) === undefined ? {} : { route: routeFor(event) }),
      tags: {
        reason: decision.reason,
        security_event: event.name,
        outcome: event.outcome,
        ...(event.reason === undefined ? {} : { event_reason: event.reason }),
      },
    },
  );
};

export const makeSecurityEventSink = (input: {
  alerts: ErrorReporter;
  counters: CounterSink;
  nowMs?: () => number;
  alertThreshold?: number;
  alertWindowMs?: number;
}): SecurityEventSink => {
  const alertCounts = new Map<string, { count: number; resetAtMs: number }>();
  const nowMs = input.nowMs ?? (() => systemClock.now().getTime());
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
      event.name !== 'authorization.denied' &&
      event.name !== 'vendor.webhook_authentication_failed'
    )
      return false;

    const key = [
      event.name,
      event.principalId ?? 'unknown',
      event.action ?? '',
      event.resourceId ?? '',
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
      const thresholdReached = shouldAlert(event);
      const decision = decideObservation({
        kind: 'security_event',
        source: 'api',
        name: event.name,
        outcome: event.outcome,
        reason: event.reason,
        thresholdReached,
      });

      if (decision.alert)
        attemptObservation(() =>
          captureSecurityAlert(input.alerts, event, decision),
        );

      const counter = decision.counter;
      if (counter !== undefined)
        attemptObservation(() =>
          input.counters.increment(counter, {
            event: event.name,
            outcome: event.outcome,
            reason: decision.reason,
          }),
        );
    },
  };
};
