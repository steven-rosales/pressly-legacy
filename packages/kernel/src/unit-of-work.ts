import type { Result } from './result.ts';

export type UnitOfWork<Operations> = Readonly<{
  transaction: <Value>(
    work: (operations: Operations) => Promise<Value>,
  ) => Promise<Value>;
}>;

export type ResultUnitOfWork<Operations> = Readonly<{
  transaction: <Value, Failure>(
    work: (operations: Operations) => Promise<Result<Value, Failure>>,
  ) => Promise<Result<Value, Failure>>;
}>;
