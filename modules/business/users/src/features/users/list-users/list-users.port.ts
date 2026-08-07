import type { ListUsersQuery, UserListResult } from './list-users.model.ts';

export type ListUsersRepository = (
  query: ListUsersQuery,
) => Promise<
  | Readonly<{ kind: 'ok'; value: UserListResult }>
  | Readonly<{ kind: 'invalid_cursor' }>
>;
