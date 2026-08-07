import { describe, expect, it } from 'vitest';
import { productionFailureToAppError } from '../../../../src/foundations/adapters/errors/production-failure.adapter.ts';
import {
  conflictFailure,
  notFoundFailure,
  validationFailure,
} from '../../../../src/foundations/language/failures/production-failure.factory.ts';

describe('Production failure edge adapter', () => {
  it.each([
    {
      failure: validationFailure({
        code: 'production_input_invalid',
        message: 'Input is invalid.',
        classification: 'semantic',
      }),
      expected: { kind: 'ValidationError', status: 422 },
    },
    {
      failure: notFoundFailure({
        code: 'production_resource_not_found',
        message: 'Resource was not found.',
      }),
      expected: { kind: 'NotFoundError', status: 404 },
    },
    {
      failure: conflictFailure({
        code: 'production_state_conflict',
        message: 'State conflicts with the command.',
      }),
      expected: { kind: 'ConflictError', status: 409 },
    },
  ])(
    'maps expected $failure.kind data only at the outer edge',
    ({ failure, expected }) => {
      expect(productionFailureToAppError(failure)).toMatchObject({
        tag: 'AppError',
        code: failure.code,
        safeMessage: failure.safeMessage,
        ...expected,
      });
    },
  );
});
