import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result, type Result } from '@pressly/kernel';
import {
  listUsersFailure,
  type ListUsersFailure,
} from './list-users.failure.ts';
import type { ListUsersQuery, UserListResult } from './list-users.model.ts';
import type { ListUsersRepository } from './list-users.port.ts';

export type ListUsers = (
  query: ListUsersQuery,
) => Promise<Result<UserListResult, ListUsersFailure>>;

export const makeListUsers = (listUsers: ListUsersRepository): ListUsers =>
  async function listUsersUseCase(query) {
    if (
      query.businessId.trim() === '' ||
      query.limit < 1 ||
      query.limit > 100 ||
      (query.query !== null && query.query.trim().length > 120)
    )
      return result.err(listUsersFailure.invalidQuery());

    try {
      const outcome = await listUsers({
        ...query,
        query:
          query.query === null || query.query.trim() === ''
            ? null
            : query.query.trim(),
      });

      return outcome.kind === 'ok'
        ? result.ok(outcome.value)
        : result.err(listUsersFailure.invalidCursor());
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'user_list_failed',
          message: 'Customers could not be loaded.',
          safeMessage: 'Customers could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
