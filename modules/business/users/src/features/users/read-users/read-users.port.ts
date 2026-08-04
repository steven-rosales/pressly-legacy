import type {
  GetUserQuery,
  ListUsersQuery,
  UserListResult,
  UserSummary,
} from './read-users.model.ts';

export type ReadUsersRepository = Readonly<{
  list: (
    query: ListUsersQuery,
  ) => Promise<
    | Readonly<{ kind: 'ok'; value: UserListResult }>
    | Readonly<{ kind: 'invalid_cursor' }>
  >;
  get: (query: GetUserQuery) => Promise<UserSummary | null>;
}>;
