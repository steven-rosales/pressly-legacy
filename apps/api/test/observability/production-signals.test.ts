import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  makeLoggingCounterSink,
  makeProductionSignals,
} from '../../src/common/observability/production-signals.ts';

const run = (originalUrl: string, statusCode: number) => {
  const increment = vi.fn();
  const response = new EventEmitter() as EventEmitter & Response;
  response.statusCode = statusCode;
  const next = vi.fn();
  makeProductionSignals({ increment })(
    { originalUrl, path: originalUrl } as Request,
    response,
    next,
  );
  response.emit('finish');
  return { increment, next };
};

describe('LPMS operational signals', () => {
  it('writes counters through the structured runtime logger', () => {
    const info = vi.fn();
    makeLoggingCounterSink({ info } as never).increment(
      'security.webhook_authentication_failures',
      { route: '/webhooks/cents' },
    );

    expect(info).toHaveBeenCalledWith('api counter incremented', {
      metric: 'security.webhook_authentication_failures',
      labels: { route: '/webhooks/cents' },
      value: 1,
    });
  });

  it('counts durable Cents receipts after successful responses', () => {
    const { increment, next } = run('/webhooks/cents', 202);
    expect(next).toHaveBeenCalledOnce();
    expect(increment).toHaveBeenCalledWith('worker.inbox_receipts', {
      source: 'cents',
    });
  });

  it('counts production conflicts and invariant rejections', () => {
    const { increment } = run('/production/locations/l1/stages/s1/start', 409);
    expect(increment).toHaveBeenCalledWith('api.command_conflicts', {
      route: '/production/locations/l1/stages/s1/start',
    });
    expect(increment).toHaveBeenCalledWith('product.invariant_failures', {
      route: '/production/locations/l1/stages/s1/start',
    });
  });
});
