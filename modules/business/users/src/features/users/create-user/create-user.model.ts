import type { CommandContext } from '@pressly/kernel';
import type { UserProfile } from '../../../foundations/language/users/user-profile.value.ts';

export type CreateUserCommand = Readonly<{
  businessId: string;
  idempotencyKey: string;
  context: CommandContext;
  profile: UserProfile;
}>;
