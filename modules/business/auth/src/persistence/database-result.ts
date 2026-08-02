import { result, type Result } from '@pressly/kernel';
import { databaseError, mapUnknownError, type AppError } from '@pressly/errors';

export const databaseFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'auth_database_failed',
      message: 'Auth database operation failed.',
      safeMessage: 'Authentication could not be completed.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const toDatabaseResult = async <T>(
  work: () => Promise<T>,
): Promise<Result<T, AppError>> => {
  try {
    return result.ok(await work());
  } catch (error) {
    return result.err(databaseFailure(error));
  }
};
