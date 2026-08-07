import { describe, expect, it, vi } from 'vitest';
import { result } from '@pressly/kernel';
import {
  defineResultUnitOfWork,
  defineUnitOfWork,
} from '../src/unit-of-work.ts';

describe('defineUnitOfWork', () => {
  it('builds operations from the transaction selected by the runner', async () => {
    const transaction = { id: 'transaction-1' } as const;
    const runner = {
      transaction: async <Value>(
        work: (selected: typeof transaction) => Promise<Value>,
      ): Promise<Value> => work(transaction),
    };
    const defineOperations = vi.fn((selected: typeof transaction) => ({
      transactionId: selected.id,
    }));
    const unitOfWork = defineUnitOfWork(runner, defineOperations);

    const result = await unitOfWork.transaction(async (operations) =>
      operations.transactionId.toUpperCase(),
    );

    expect(Object.isFrozen(unitOfWork)).toBe(true);
    expect(defineOperations).toHaveBeenCalledOnce();
    expect(defineOperations).toHaveBeenCalledWith(transaction);
    expect(result).toBe('TRANSACTION-1');
  });

  it('does not construct operations before a transaction starts', () => {
    const defineOperations = vi.fn(() => ({ value: true }));
    const runner = {
      transaction: async <Value>(
        work: (transaction: object) => Promise<Value>,
      ): Promise<Value> => work({}),
    };

    defineUnitOfWork(runner, defineOperations);

    expect(defineOperations).not.toHaveBeenCalled();
  });
});

describe('defineResultUnitOfWork', () => {
  it('commits successful typed results', async () => {
    let committed = false;
    let rolledBack = false;
    const transaction = { id: 'transaction-1' } as const;
    const runner = {
      transaction: async <Value>(
        work: (selected: typeof transaction) => Promise<Value>,
      ): Promise<Value> => {
        try {
          const value = await work(transaction);
          committed = true;
          return value;
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      },
    };
    const unitOfWork = defineResultUnitOfWork(runner, (selected) => ({
      transactionId: selected.id,
    }));

    const outcome = await unitOfWork.transaction(async (operations) =>
      result.ok(operations.transactionId.toUpperCase()),
    );

    expect(outcome).toEqual(result.ok('TRANSACTION-1'));
    expect(committed).toBe(true);
    expect(rolledBack).toBe(false);
  });

  it('rolls back and returns an expected typed failure as data', async () => {
    let committed = false;
    let rolledBack = false;
    const runner = {
      transaction: async <Value>(
        work: (transaction: object) => Promise<Value>,
      ): Promise<Value> => {
        try {
          const value = await work({});
          committed = true;
          return value;
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      },
    };
    const unitOfWork = defineResultUnitOfWork(runner, () => ({ value: true }));
    const failure = { code: 'expected_conflict' } as const;

    const outcome = await unitOfWork.transaction(async () =>
      result.err(failure),
    );

    expect(outcome).toEqual(result.err(failure));
    expect(committed).toBe(false);
    expect(rolledBack).toBe(true);
  });

  it('rethrows unexpected exceptions unchanged', async () => {
    const runner = {
      transaction: async <Value>(
        work: (transaction: object) => Promise<Value>,
      ): Promise<Value> => work({}),
    };
    const unitOfWork = defineResultUnitOfWork(runner, () => ({}));
    const unexpected = new Error('database unavailable');

    await expect(
      unitOfWork.transaction(async () => {
        throw unexpected;
      }),
    ).rejects.toBe(unexpected);
  });
});
