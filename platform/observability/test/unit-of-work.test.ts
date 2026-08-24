import type { ResultUnitOfWork, UnitOfWork } from '@pressly/cells/unit-of-work';
import { describe, expect, it, vi } from 'vitest';
import type { CounterSink } from '../src/counter.js';
import type { MeasurementSink } from '../src/measurement.js';
import type { TraceSink, TraceSpan } from '../src/trace.js';
import {
  observeResultUnitOfWork,
  observeUnitOfWork,
} from '../src/unit-of-work.js';

const sinks = (): {
  counters: CounterSink;
  measurements: MeasurementSink;
  increment: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
} => {
  const increment = vi.fn();
  const observe = vi.fn();

  return {
    counters: { increment },
    measurements: { observe },
    increment,
    observe,
  };
};

const tracing = (): {
  trace: TraceSink;
  startActiveSpan: ReturnType<typeof vi.fn>;
  setAttribute: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
} => {
  const setAttribute = vi.fn();
  const setStatus = vi.fn();
  const activeSpan: TraceSpan = { setAttribute, setStatus };
  const startActiveSpan = vi.fn();
  const trace: TraceSink = {
    startActiveSpan: (definition, work) => {
      startActiveSpan(definition, work);
      return work(activeSpan);
    },
  };

  return {
    trace,
    startActiveSpan,
    setAttribute,
    setStatus,
  };
};

describe('observed unit of work', () => {
  it('records a committed transaction with monotonic duration and an active span', async () => {
    const operations = Object.freeze({ store: vi.fn() });
    const unitOfWork: UnitOfWork<typeof operations> = {
      transaction: (work) => work(operations),
    };
    const signals = sinks();
    const spans = tracing();
    const times = [1_000_000_000n, 3_500_000_000n];
    const observed = observeUnitOfWork({
      unitOfWork,
      operation: 'orders.correct_order',
      counters: signals.counters,
      measurements: signals.measurements,
      trace: spans.trace,
      nowNanoseconds: () => times.shift() ?? 3_500_000_000n,
    });

    await expect(
      observed.transaction(async (received) => {
        expect(received).toBe(operations);
        return 'committed';
      }),
    ).resolves.toBe('committed');

    expect(spans.startActiveSpan).toHaveBeenCalledWith(
      {
        name: 'orders.correct_order',
        operation: 'db.transaction',
        attributes: { operation: 'orders.correct_order' },
      },
      expect.any(Function),
    );
    expect(signals.increment).toHaveBeenCalledWith('db.transactions', {
      operation: 'orders.correct_order',
      outcome: 'committed',
    });
    expect(signals.observe).toHaveBeenCalledWith(
      'db.transaction_duration_seconds',
      2.5,
      { operation: 'orders.correct_order', outcome: 'committed' },
    );
    expect(spans.setAttribute).toHaveBeenCalledWith('outcome', 'committed');
    expect(spans.setStatus).toHaveBeenCalledWith('ok');
  });

  it('classifies a returned Result.err as an expected rollback', async () => {
    const rejection = Object.freeze({ code: 'version_conflict' });
    const unitOfWork: ResultUnitOfWork<Readonly<{ save: () => void }>> = {
      transaction: async (work) => work({ save: vi.fn() }),
    };
    const signals = sinks();
    const observed = observeResultUnitOfWork({
      unitOfWork,
      operation: 'production.advance_stage',
      counters: signals.counters,
      measurements: signals.measurements,
      nowNanoseconds: vi
        .fn<() => bigint>()
        .mockReturnValueOnce(4_000_000_000n)
        .mockReturnValueOnce(4_250_000_000n),
    });

    const result = await observed.transaction(async () => ({
      tag: 'err' as const,
      error: rejection,
    }));

    expect(result).toEqual({ tag: 'err', error: rejection });
    expect(signals.increment).toHaveBeenCalledWith('db.transactions', {
      operation: 'production.advance_stage',
      outcome: 'expected_rollback',
    });
    expect(signals.observe).toHaveBeenCalledWith(
      'db.transaction_duration_seconds',
      0.25,
      {
        operation: 'production.advance_stage',
        outcome: 'expected_rollback',
      },
    );
  });

  it('rethrows the identical transaction error after recording failure', async () => {
    const transactionFailure = new Error('database unavailable');
    const unitOfWork: UnitOfWork<Readonly<Record<string, never>>> = {
      transaction: async () => {
        throw transactionFailure;
      },
    };
    const signals = sinks();
    const observed = observeUnitOfWork({
      unitOfWork,
      operation: 'identity.confirm_mfa_enrollment',
      counters: signals.counters,
      measurements: signals.measurements,
      nowNanoseconds: vi
        .fn<() => bigint>()
        .mockReturnValueOnce(10_000_000_000n)
        .mockReturnValueOnce(11_000_000_000n),
    });

    await expect(observed.transaction(async () => undefined)).rejects.toBe(
      transactionFailure,
    );
    expect(signals.increment).toHaveBeenCalledWith('db.transactions', {
      operation: 'identity.confirm_mfa_enrollment',
      outcome: 'failed',
    });
    expect(signals.observe).toHaveBeenCalledWith(
      'db.transaction_duration_seconds',
      1,
      {
        operation: 'identity.confirm_mfa_enrollment',
        outcome: 'failed',
      },
    );
  });

  it('keeps transaction success authoritative when every observation fails', async () => {
    const unitOfWork: UnitOfWork<Readonly<Record<string, never>>> = {
      transaction: async (work) => work({}),
    };
    const observed = observeUnitOfWork({
      unitOfWork,
      operation: 'orders.release_fulfillment',
      counters: {
        increment: () => {
          throw new Error('counter unavailable');
        },
      },
      measurements: {
        observe: () => {
          throw new Error('measurement unavailable');
        },
      },
      trace: {
        startActiveSpan: async (_definition, work) => {
          const value = await work({
            setAttribute: () => {
              throw new Error('span attribute unavailable');
            },
            setStatus: () => {
              throw new Error('span status unavailable');
            },
          });
          throw new Error(`trace unavailable after ${String(value)}`);
        },
      },
      nowNanoseconds: vi
        .fn<() => bigint>()
        .mockReturnValueOnce(1n)
        .mockReturnValueOnce(2n),
    });

    await expect(observed.transaction(async () => 42)).resolves.toBe(42);
  });

  it('still runs a transaction when the monotonic clock is unavailable', async () => {
    const transaction = vi.fn();
    const unitOfWork: UnitOfWork<Readonly<Record<string, never>>> = {
      transaction: (work) => {
        transaction(work);
        return work({});
      },
    };
    const signals = sinks();
    const observed = observeUnitOfWork({
      unitOfWork,
      operation: 'orders.release_fulfillment',
      counters: signals.counters,
      measurements: signals.measurements,
      nowNanoseconds: () => {
        throw new Error('clock unavailable');
      },
    });

    await expect(observed.transaction(async () => 'committed')).resolves.toBe(
      'committed',
    );
    expect(transaction).toHaveBeenCalledOnce();
    expect(signals.increment).toHaveBeenCalledOnce();
    expect(signals.observe).not.toHaveBeenCalled();
  });
});
