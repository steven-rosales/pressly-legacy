import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type { UserRecord } from '../user-profile/user-profile.model.ts';

export type UserSummary = UserRecord &
  Readonly<{
    displayName: string;
    possibleDuplicateCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>;

export type ListUsersQuery = Readonly<{
  businessId: string;
  query: string | null;
  active: boolean | null;
  limit: number;
  cursor: string | null;
}>;

export type UserListResult = Readonly<{
  items: readonly UserSummary[];
  nextCursor: string | null;
}>;

export type ListUsers = (
  query: ListUsersQuery,
) => Promise<Result<UserListResult, AppError>>;

export type GetUser = (query: {
  businessId: string;
  userId: string;
}) => Promise<Result<UserSummary, AppError>>;

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
