import {
  err,
  isAppError,
  makeAppError,
  ok,
  type AppError,
  type Result,
} from '@pressly/errors';

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
    return ok(await work());
  } catch (error) {
    return err(isAppError(error) ? error : databaseFailure(error));
  }
};
