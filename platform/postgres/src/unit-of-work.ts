import * as result from '@pressly/cells/result';
import type { Err, Result } from '@pressly/cells/result';
import type { ResultUnitOfWork, UnitOfWork } from '@pressly/cells/unit-of-work';

export type TransactionRunner<Transaction> = Readonly<{
  transaction: <Value>(
    work: (transaction: Transaction) => Promise<Value>,
  ) => Promise<Value>;
}>;

/**
 * Adapts a transaction runner into an application-shaped unit of work.
 * The caller owns the operations vocabulary; this factory owns only the
 * repeated transaction-scoping mechanism.
 */
export const defineUnitOfWork = <Transaction, Operations>(
  runner: TransactionRunner<Transaction>,
  defineOperations: (transaction: Transaction) => Operations,
): UnitOfWork<Operations> =>
  Object.freeze({
    transaction: (work) =>
      runner.transaction((transaction) => work(defineOperations(transaction))),
  });

const resultRollbackSignal = Object.freeze({
  tag: 'pressly_result_transaction_rollback',
});

/**
 * Adapts the exception-only rollback mechanism of a transaction runner into
 * an application-visible Result. The private signal never crosses this
 * adapter: expected failures remain typed data and unexpected exceptions are
 * rethrown unchanged.
 */
export const defineResultUnitOfWork = <Transaction, Operations>(
  runner: TransactionRunner<Transaction>,
  defineOperations: (transaction: Transaction) => Operations,
): ResultUnitOfWork<Operations> =>
  Object.freeze({
    transaction: async <Value, Failure>(
      work: (operations: Operations) => Promise<Result<Value, Failure>>,
    ): Promise<Result<Value, Failure>> => {
      let rejected: Err<Failure> | undefined;

      try {
        return await runner.transaction(async (transaction) => {
          const outcome = await work(defineOperations(transaction));
          if (result.isErr(outcome)) {
            rejected = outcome;
            throw resultRollbackSignal;
          }

          return outcome;
        });
      } catch (error) {
        if (error === resultRollbackSignal && rejected !== undefined)
          return rejected;
        throw error;
      }
    },
  });
