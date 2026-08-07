import type { UserSummary } from '../../../foundations/language/user-summary/user-summary.model.ts';
import type { GetUserQuery } from './get-user.model.ts';

export type GetUserRepository = (
  query: GetUserQuery,
) => Promise<UserSummary | null>;
