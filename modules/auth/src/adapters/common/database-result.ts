import { result, type Result } from '@pressly/kernel';
import { isAppError, makeAppError, type AppError } from '@pressly/errors';

export const databaseFailure = (cause: unknown): AppError =>
  makeAppError({
    kind: 'DatabaseError',
    code: 'auth_database_failed',
    message: 'Auth database operation failed.',
    safeMessage: 'Authentication could not be completed.',
    status: 500,
    cause,
  });

export const toDatabaseResult = async <T>(
  work: () => Promise<T>,
): Promise<Result<T, AppError>> => {
  try {
    return result.ok(await work());
  } catch (error) {
    return result.err(isAppError(error) ? error : databaseFailure(error));
  }
};
