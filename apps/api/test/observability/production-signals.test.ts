import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  makeLoggingCounterSink,
  makeProductionDomainSignals,
  makeProductionSignals,
} from '../../src/common/observability/production-signals.ts';

const run = (
  originalUrl: string,
  statusCode: number,
  routePath?: string,
  baseUrl = '',
) => {
  const increment = vi.fn();
  const response = new EventEmitter() as EventEmitter & Response;
  response.statusCode = statusCode;
  const next = vi.fn();
  makeProductionSignals({ increment })(
    {
      originalUrl,
      path: originalUrl,
      method: 'POST',
      baseUrl,
      ...(routePath === undefined ? {} : { route: { path: routePath } }),
    } as Request,
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
    const { increment, next } = run(
      '/webhooks/cents',
      202,
      '/',
      '/webhooks/cents',
    );
    expect(next).toHaveBeenCalledOnce();
    expect(increment).toHaveBeenCalledWith('worker.inbox_receipts', {
      source: 'cents',
    });
  });

  it('counts production conflicts and invariant rejections', () => {
    const { increment } = run(
      '/production/locations/l1/stages/s1/start',
      409,
      '/production/locations/:locationId/stages/:stageRunId/start',
    );
    expect(increment).toHaveBeenCalledWith('api.command_conflicts', {
      route: '/production/locations/:locationId/stages/:stageRunId/start',
    });
    expect(increment).toHaveBeenCalledWith('product.invariant_failures', {
      route: '/production/locations/:locationId/stages/:stageRunId/start',
    });
  });

  it('maps committed run-centered domain outcomes to counters', () => {
    const increment = vi.fn();
    const signals = makeProductionDomainSignals({ increment });

    signals.planSuperseded();
    signals.runStarted();
    signals.placementOutcome({
      status: 'not_placed',
      reason: 'queue_conflict',
      mode: 'automatic',
    });
    signals.queueConflict({ operation: 'automatic_placement' });
    signals.batchFrozen({ source: 'stage_start' });
    signals.overtimeConfirmed();

    expect(increment).toHaveBeenCalledWith('production.plan_supersessions', {
      operation: 'compute_replace_current',
    });
    expect(increment).toHaveBeenCalledWith('production.runs_started');
    expect(increment).toHaveBeenCalledWith('production.placement_outcomes', {
      status: 'not_placed',
      reason: 'queue_conflict',
      mode: 'automatic',
    });
    expect(increment).toHaveBeenCalledWith('production.queue_conflicts', {
      operation: 'automatic_placement',
    });
    expect(increment).toHaveBeenCalledWith('production.batch_freezes', {
      source: 'stage_start',
    });
    expect(increment).toHaveBeenCalledWith(
      'production.overtime_confirmations',
      {
        status: 'placed',
      },
    );
  });

  it('does not infer committed business outcomes from HTTP success alone', () => {
    const { increment } = run('/production/locations/l1/schedules', 200);
    expect(increment).not.toHaveBeenCalled();
  });
});
