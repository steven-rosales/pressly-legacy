import { result } from '@pressly/kernel';
import { userError } from '../failure-mapping/user.error.ts';
import type {
  GetUser,
  ListUsers,
  ReadUsersRepository,
} from './read-users.port.ts';

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
        userError('USER_LIST_INVALID', 'The customer query is invalid.', 400),
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
            userError(
              'USER_CURSOR_INVALID',
              'The customer page cursor is invalid.',
              400,
            ),
          );
    } catch (error) {
      return result.err(
        userError(
          'USER_LIST_FAILED',
          'Customers could not be loaded.',
          503,
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
        userError('USER_GET_INVALID', 'The customer query is invalid.', 400),
      );
    try {
      const user = await repo.get(query);
      return user === null
        ? result.err(
            userError('USER_NOT_FOUND', 'The customer was not found.', 404),
          )
        : result.ok(user);
    } catch (error) {
      return result.err(
        userError(
          'USER_GET_FAILED',
          'The customer could not be loaded.',
          503,
          error,
        ),
      );
    }
  };
