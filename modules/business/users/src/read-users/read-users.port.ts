import type {
  ListUsersQuery,
  UserListResult,
  UserSummary,
} from '../users.port.ts';

export type ReadUsersRepository = Readonly<{
  list: (
    query: ListUsersQuery,
  ) => Promise<
    | Readonly<{ kind: 'ok'; value: UserListResult }>
    | Readonly<{ kind: 'invalid_cursor' }>
  >;
  get: (query: {
    businessId: string;
    userId: string;
  }) => Promise<UserSummary | null>;
}>;
