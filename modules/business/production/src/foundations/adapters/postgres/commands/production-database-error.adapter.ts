import { databaseError } from '@pressly/errors/factories';
import { mapUnknownError } from '@pressly/errors/app-error';

export const withProductionDatabaseError = async <T>(
  code: string,
  safeMessage: string,
  work: () => Promise<T>,
): Promise<T> => {
  try {
    return await work();
  } catch (cause) {
    throw mapUnknownError(cause, (unknownCause) =>
      databaseError({
        code: code.toLowerCase(),
        message: safeMessage,
        safeMessage,
        status: 503,
        cause: unknownCause,
      }),
    );
  }
};
