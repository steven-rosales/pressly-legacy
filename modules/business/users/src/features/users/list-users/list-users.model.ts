import type { UserSummary } from '../../../foundations/language/user-summary/user-summary.model.ts';

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
