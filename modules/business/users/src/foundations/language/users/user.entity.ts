import type { UserProfile } from './user-profile.value.ts';

export type User = UserProfile &
  Readonly<{
    id: string;
    businessId: string;
    version: number;
    active: boolean;
  }>;
