import { result } from '@pressly/kernel';
import {
  databaseError,
  mapUnknownError,
  notFoundError,
  validationError,
  type AppError,
} from '@pressly/errors';
import type {
  GetUser,
  ListUsers,
  ReadUsersRepository,
} from './read-users.port.ts';

const invalidUserQuery = (code: string, message: string): AppError =>
  validationError({ code, message, safeMessage: message });

const userReadFailed = (
  code: string,
  message: string,
  cause: unknown,
): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code,
      message,
      safeMessage: message,
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeListUsers =
  (repo: ReadUsersRepository): ListUsers =>
  async (query) => {
    if (
      query.businessId.trim() === '' ||
      query.limit < 1 ||
      query.limit > 100 ||
      (query.query !== null && query.query.trim().length > 120)
    )
      return result.err(
        invalidUserQuery('user_list_invalid', 'The customer query is invalid.'),
      );

    try {
      const outcome = await repo.list({
        ...query,
        query:
          query.query === null || query.query.trim() === ''
            ? null
            : query.query.trim(),
      });

      return outcome.kind === 'ok'
        ? result.ok(outcome.value)
        : result.err(
            invalidUserQuery(
              'user_cursor_invalid',
              'The customer page cursor is invalid.',
            ),
          );
    } catch (error) {
      return result.err(
        userReadFailed(
          'user_list_failed',
          'Customers could not be loaded.',
          error,
        ),
      );
    }
  };

export const makeGetUser =
  (repo: ReadUsersRepository): GetUser =>
  async (query) => {
    if (query.businessId.trim() === '' || query.userId.trim() === '')
      return result.err(
        invalidUserQuery('user_get_invalid', 'The customer query is invalid.'),
      );

    try {
      const user = await repo.get(query);

      return user === null
        ? result.err(
            notFoundError({
              code: 'user_not_found',
              message: 'The customer was not found.',
              safeMessage: 'The customer was not found.',
            }),
          )
        : result.ok(user);
    } catch (error) {
      return result.err(
        userReadFailed(
          'user_get_failed',
          'The customer could not be loaded.',
          error,
        ),
      );
    }
  };
