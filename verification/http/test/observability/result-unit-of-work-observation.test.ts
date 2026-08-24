import {
  defineResultUnitOfWork,
  type TransactionRunner,
} from '@pressly/postgres/unit-of-work';
import * as result from '@pressly/cells/result';
import { observeResultUnitOfWork } from '@pressly/observability';
import { describe, expect, it, vi } from 'vitest';

describe('result unit-of-work observation contract', () => {
  it('observes the translated expected rollback outside the database adapter', async () => {
    type StagedTransaction = Readonly<{ write: (nextValue: string) => void }>;

    let durableValue = 'before';
    const rollback = vi.fn();
    const increment = vi.fn();
    const observe = vi.fn();

    const runner: TransactionRunner<StagedTransaction> = {
      transaction: async (work) => {
        let stagedValue = durableValue;

        try {
          const value = await work({
            write: (nextValue: string) => {
              stagedValue = nextValue;
            },
          });
          durableValue = stagedValue;
          return value;
        } catch (error: unknown) {
          rollback();
          throw error;
        }
      },
    };
    const translatedUnitOfWork = defineResultUnitOfWork(
      runner,
      (transaction) => transaction,
    );
    const times = [1_000_000_000n, 1_250_000_000n];
    const observedUnitOfWork = observeResultUnitOfWork({
      unitOfWork: translatedUnitOfWork,
      operation: 'identity.confirm_mfa_enrollment',
      counters: { increment },
      measurements: { observe },
      nowNanoseconds: () => times.shift() ?? 1_250_000_000n,
    });
    const expectedRejection = result.err({ code: 'enrollment_rejected' });

    const outcome = await observedUnitOfWork.transaction(
      async (transaction) => {
        transaction.write('after');
        return expectedRejection;
      },
    );

    expect(outcome).toBe(expectedRejection);
    expect(durableValue).toBe('before');
    expect(rollback).toHaveBeenCalledOnce();
    expect(increment).toHaveBeenCalledWith('db.transactions', {
      operation: 'identity.confirm_mfa_enrollment',
      outcome: 'expected_rollback',
    });
    expect(observe).toHaveBeenCalledWith(
      'db.transaction_duration_seconds',
      0.25,
      {
        operation: 'identity.confirm_mfa_enrollment',
        outcome: 'expected_rollback',
      },
    );
  });
});
