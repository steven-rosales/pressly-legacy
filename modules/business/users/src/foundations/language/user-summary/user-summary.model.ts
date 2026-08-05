import type { User } from '../users/user.entity.ts';

export type UserSummary = User &
  Readonly<{
    displayName: string;
    possibleDuplicateCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>;

export type UserSummarySource = User &
  Readonly<{
    createdAt: Date;
    updatedAt: Date;
  }>;
