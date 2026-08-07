import type { CommandContext } from '@pressly/kernel';
import type { UserProfile } from '../../../foundations/language/users/user-profile.value.ts';

export type UpdateUserCommand = Readonly<{
  businessId: string;
  idempotencyKey: string;
  context: CommandContext;
  userId: string;
  expectedVersion: number;
  changes: Partial<UserProfile> & Readonly<{ active?: boolean }>;
}>;
