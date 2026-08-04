import type { User } from '../../../foundations/language/users/user.entity.ts';

export type UserSummary = User &
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

export type GetUserQuery = Readonly<{
  businessId: string;
  userId: string;
}>;
