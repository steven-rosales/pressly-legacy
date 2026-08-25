import { describe, expect, it, vi } from 'vitest';
import { receiveCentsWebhookCounterSignals } from '@pressly/ingress-system/operations/sources/receive-cents-webhook/response-signals';
import {
  makeProductionDomainSignals,
  productionHttpCounterSignals,
} from '@pressly/production-system/observability/signals';

describe('LPMS operational signals', () => {
  it('counts durable Cents receipts after successful responses', () => {
    expect(
      receiveCentsWebhookCounterSignals({
        operationId: 'ingress.receive-cents-webhook.v1',
        status: 200,
      }),
    ).toEqual([
      {
        name: 'worker.inbox_receipts',
        attributes: { source: 'cents' },
      },
    ]);
  });

  it('counts production conflicts and invariant rejections', () => {
    expect(
      productionHttpCounterSignals({
        operationId: 'production.advance-stage.v1',
        status: 409,
      }),
    ).toEqual([
      {
        name: 'api.command_conflicts',
        attributes: { operation_id: 'production.advance-stage.v1' },
      },
      {
        name: 'product.invariant_failures',
        attributes: { operation_id: 'production.advance-stage.v1' },
      },
    ]);
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
    signals.orderRouteOutcome({
      operation: 'commit',
      status: 'committed',
      kind: 'exception',
      reason: 'needs_more_drying',
    });
    signals.progressReconciled({
      target: 'drying_started',
      runCompleted: false,
    });

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
    expect(increment).toHaveBeenCalledWith('production.order_route_outcomes', {
      operation: 'commit',
      status: 'committed',
      kind: 'exception',
      reason: 'needs_more_drying',
    });
    expect(increment).toHaveBeenCalledWith(
      'production.progress_reconciliations',
      { target: 'drying_started', runCompleted: 'false' },
    );
  });

  it('does not infer committed business outcomes from HTTP success alone', () => {
    expect(
      productionHttpCounterSignals({
        operationId: 'production.accept-schedule.v1',
        status: 200,
      }),
    ).toEqual([]);
  });
});
