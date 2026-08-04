import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result, type Result } from '@pressly/kernel';
import {
  readUsersFailure,
  type ReadUsersFailure,
} from './read-users.failure.ts';
import type {
  GetUserQuery,
  ListUsersQuery,
  UserListResult,
  UserSummary,
} from './read-users.model.ts';
import type { ReadUsersRepository } from './read-users.port.ts';

export type ListUsers = (
  query: ListUsersQuery,
) => Promise<Result<UserListResult, ReadUsersFailure>>;

export type GetUser = (
  query: GetUserQuery,
) => Promise<Result<UserSummary, ReadUsersFailure>>;

const throwUserReadPersistenceFailure = (
  code: 'user_list_failed' | 'user_get_failed',
  message: string,
  cause: unknown,
): never => {
  throw mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code,
      message,
      safeMessage: message,
      status: 503,
      cause: unknownCause,
    }),
  );
};

export const makeListUsers = (repo: ReadUsersRepository): ListUsers =>
  async function listUsers(query) {
    if (
      query.businessId.trim() === '' ||
      query.limit < 1 ||
      query.limit > 100 ||
      (query.query !== null && query.query.trim().length > 120)
    )
      return result.err(readUsersFailure.invalidList());

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
        : result.err(readUsersFailure.invalidCursor());
    } catch (error) {
      return throwUserReadPersistenceFailure(
        'user_list_failed',
        'Customers could not be loaded.',
        error,
      );
    }
  };

export const makeGetUser = (repo: ReadUsersRepository): GetUser =>
  async function getUser(query) {
    if (query.businessId.trim() === '' || query.userId.trim() === '')
      return result.err(readUsersFailure.invalidGet());

    try {
      const user = await repo.get(query);
      return user === null
        ? result.err(readUsersFailure.notFound())
        : result.ok(user);
    } catch (error) {
      return throwUserReadPersistenceFailure(
        'user_get_failed',
        'The customer could not be loaded.',
        error,
      );
    }
  };
