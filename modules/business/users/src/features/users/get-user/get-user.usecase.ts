import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result, type Result } from '@pressly/kernel';
import type { UserSummary } from '../../../foundations/language/user-summary/user-summary.model.ts';
import { getUserFailure, type GetUserFailure } from './get-user.failure.ts';
import type { GetUserQuery } from './get-user.model.ts';
import type { GetUserRepository } from './get-user.port.ts';

export type GetUser = (
  query: GetUserQuery,
) => Promise<Result<UserSummary, GetUserFailure>>;

export const makeGetUser = (getUser: GetUserRepository): GetUser =>
  async function getUserUseCase(query) {
    if (query.businessId.trim() === '' || query.userId.trim() === '')
      return result.err(getUserFailure.invalidQuery());

    try {
      const user = await getUser(query);
      return user === null
        ? result.err(getUserFailure.notFound())
        : result.ok(user);
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'user_get_failed',
          message: 'The customer could not be loaded.',
          safeMessage: 'The customer could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
