import { authError, rateLimitError } from '@pressly/errors';
import type { Logger, SecurityEventSink } from '@pressly/logging';
import { attemptObservation } from '@pressly/metrics';
import type { RequestHandler } from 'express';

type Clock = Readonly<{ nowMs: () => number }>;

type RateLimitEntry = {
  count: number;
  resetAtMs: number;
};

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}>;

export type RateLimitStore = Readonly<{
  consume: (key: string, limit: number, windowMs: number) => RateLimitDecision;
}>;

const systemClock: Clock = { nowMs: () => Date.now() };

export const makeMemoryRateLimitStore = (input?: {
  clock?: Clock;
  maxEntries?: number;
}): RateLimitStore => {
  const entries = new Map<string, RateLimitEntry>();
  const clock = input?.clock ?? systemClock;
  const maxEntries = input?.maxEntries ?? 100_000;

  const removeOldestEntry = (): void => {
    const oldestKey = entries.keys().next().value as string | undefined;
    if (oldestKey !== undefined) entries.delete(oldestKey);
  };

  return {
    consume(key, limit, windowMs) {
      const nowMs = clock.nowMs();
      const current = entries.get(key);
      const entry =
        current === undefined || current.resetAtMs <= nowMs
          ? { count: 0, resetAtMs: nowMs + windowMs }
          : current;

      if (current === undefined && entries.size >= maxEntries)
        removeOldestEntry();

      entry.count += 1;
      entries.delete(key);
      entries.set(key, entry);

      const allowed = entry.count <= limit;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((entry.resetAtMs - nowMs) / 1_000),
      );

      return {
        allowed,
        limit,
        remaining: allowed ? Math.max(0, limit - entry.count) : 0,
        resetAtMs: entry.resetAtMs,
        retryAfterSeconds,
      };
    },
  };
};

const setRateLimitHeaders = (
  res: Parameters<RequestHandler>[1],
  decision: RateLimitDecision,
): void => {
  res.setHeader('RateLimit-Limit', String(decision.limit));
  res.setHeader('RateLimit-Remaining', String(decision.remaining));
  res.setHeader(
    'RateLimit-Reset',
    String(Math.ceil(decision.resetAtMs / 1_000)),
  );
};

export const makeIpRateLimiter =
  (input: {
    name: string;
    limit: number;
    windowMs: number;
    store: RateLimitStore;
    logger: Logger;
    securityEvents: SecurityEventSink;
  }): RequestHandler =>
  (req, res, next): void => {
    const decision = input.store.consume(
      `${input.name}:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`,
      input.limit,
      input.windowMs,
    );

    setRateLimitHeaders(res, decision);

    if (decision.allowed) {
      next();
      return;
    }

    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    input.securityEvents.emit({
      name: 'request.rate_limited',
      occurredAt: new Date().toISOString(),
      outcome: 'denied',
      ...((res.locals['requestId'] as string | undefined) === undefined
        ? {}
        : { requestId: res.locals['requestId'] as string }),
      resourceType: 'http.route',
      resourceId: req.path,
      reason: input.name,
    });

    next(
      rateLimitError({
        code: 'rate_limit_exceeded',
        message: `Rate limit exceeded for ${input.name}.`,
        safeMessage: 'Too many requests. Please try again later.',
        publicDetails: { retryAfterSeconds: decision.retryAfterSeconds },
      }),
    );
  };

export const makeIdentityRateLimiter =
  (input: {
    name: string;
    limit: number;
    windowMs: number;
    store: RateLimitStore;
    logger: Logger;
    securityEvents: SecurityEventSink;
  }): RequestHandler =>
  (req, res, next): void => {
    const identityId = (
      res.locals['auth'] as
        | Readonly<{
            principal?: Readonly<{ identityId?: string }>;
          }>
        | undefined
    )?.principal?.identityId;

    if (identityId === undefined) {
      attemptObservation(() =>
        input.logger.warn('identity rate limiter missing auth context', {
          limiter: input.name,
          path: req.path,
        }),
      );
      next(
        authError({
          code: 'identity_rate_limit_auth_missing',
          message: `Identity rate limiter ${input.name} ran without authentication.`,
          safeMessage: 'Authentication is required.',
        }),
      );
      return;
    }

    const decision = input.store.consume(
      `${input.name}:${identityId}`,
      input.limit,
      input.windowMs,
    );
    setRateLimitHeaders(res, decision);

    if (decision.allowed) {
      next();
      return;
    }

    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    input.securityEvents.emit({
      name: 'request.rate_limited',
      occurredAt: new Date().toISOString(),
      outcome: 'denied',
      ...((res.locals['requestId'] as string | undefined) === undefined
        ? {}
        : { requestId: res.locals['requestId'] as string }),
      principalId: identityId,
      resourceType: 'http.route',
      resourceId: req.path,
      reason: input.name,
    });
    next(
      rateLimitError({
        code: 'rate_limit_exceeded',
        message: `Rate limit exceeded for ${input.name}.`,
        safeMessage: 'Too many requests. Please try again later.',
        publicDetails: { retryAfterSeconds: decision.retryAfterSeconds },
      }),
    );
  };
