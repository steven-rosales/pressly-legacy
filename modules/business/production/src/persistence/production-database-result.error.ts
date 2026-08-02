import { databaseError, mapUnknownError, type AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';

export const toProductionDatabaseResult = async <T>(
  code: string,
  safeMessage: string,
  work: () => Promise<T>,
): Promise<Result<T, AppError>> =>
  result.fromAsyncThrowable(work, (cause) =>
    mapUnknownError(cause, (unknownCause) =>
      databaseError({
        code: code.toLowerCase(),
        message: safeMessage,
        safeMessage,
        status: 503,
        cause: unknownCause,
      }),
    ),
  );
