import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';

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

export const runDatabaseOperation = async <T>(
  work: () => Promise<T>,
): Promise<T> => {
  try {
    return await work();
  } catch (error) {
    throw databaseFailure(error);
  }
};
