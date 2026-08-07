import { invariantViolationError } from '@pressly/errors/factories';
import type { IdSource } from '@pressly/kernel';

export const makeSequenceIdSource = <Id extends string>(
  values: readonly Id[],
): IdSource<Id> => {
  const sequence = [...values];
  let index = 0;

  return Object.freeze({
    next: (): Id => {
      const value = sequence[index];
      if (value === undefined)
        throw invariantViolationError({
          code: 'test_id_sequence_exhausted',
          message: 'The deterministic test ID sequence is exhausted.',
        });

      index += 1;
      return value;
    },
  });
};
