import { describe, expect, it, vi } from 'vitest';
import {
  isolateTraceSink,
  type TraceSink,
  type TraceSpan,
} from '../src/trace.js';

const span = (input?: {
  setAttribute?: TraceSpan['setAttribute'];
  setStatus?: TraceSpan['setStatus'];
}): TraceSpan => ({
  setAttribute: input?.setAttribute ?? vi.fn(),
  setStatus: input?.setStatus ?? vi.fn(),
});

describe('isolateTraceSink', () => {
  it('runs work once with a null span when tracing fails before the callback', async () => {
    const traceFailure = new Error('trace unavailable');
    const work = vi.fn(async () => 42);
    const trace = isolateTraceSink({
      startActiveSpan: async () => {
        throw traceFailure;
      },
    });

    await expect(
      trace.startActiveSpan(
        { name: 'orders.correct_order', operation: 'db.transaction' },
        work,
      ),
    ).resolves.toBe(42);
    expect(work).toHaveBeenCalledOnce();
  });

  it('preserves the work result when tracing fails after the callback', async () => {
    const work = vi.fn(async () => 'committed');
    const trace = isolateTraceSink({
      startActiveSpan: async (_definition, execute) => {
        await execute(span());
        throw new Error('trace finalization failed');
      },
    });

    await expect(
      trace.startActiveSpan(
        { name: 'orders.correct_order', operation: 'db.transaction' },
        work,
      ),
    ).resolves.toBe('committed');
    expect(work).toHaveBeenCalledOnce();
  });

  it('rethrows the identical work failure even if the trace also fails', async () => {
    const workFailure = new Error('transaction failed');
    const trace: TraceSink = isolateTraceSink({
      startActiveSpan: async (_definition, execute) => {
        try {
          await execute(span());
        } catch {
          // Simulate a trace implementation replacing a callback rejection.
        }
        throw new Error('trace finalization failed');
      },
    });

    const observed = trace.startActiveSpan(
      { name: 'orders.correct_order', operation: 'db.transaction' },
      async () => {
        throw workFailure;
      },
    );

    await expect(observed).rejects.toBe(workFailure);
  });

  it('contains span mutation failures and executes duplicate callbacks once', async () => {
    const work = vi.fn(async (activeSpan: TraceSpan) => {
      activeSpan.setAttribute('outcome', 'committed');
      activeSpan.setStatus('ok');
      return 'committed';
    });
    const failingSpan = span({
      setAttribute: () => {
        throw new Error('attribute failed');
      },
      setStatus: () => {
        throw new Error('status failed');
      },
    });
    const trace = isolateTraceSink({
      startActiveSpan: async (_definition, execute) => {
        await execute(failingSpan);
        await execute(failingSpan);
        return 'ignored';
      },
    });

    await expect(
      trace.startActiveSpan(
        { name: 'orders.correct_order', operation: 'db.transaction' },
        work,
      ),
    ).resolves.toBe('committed');
    expect(work).toHaveBeenCalledOnce();
  });
});
