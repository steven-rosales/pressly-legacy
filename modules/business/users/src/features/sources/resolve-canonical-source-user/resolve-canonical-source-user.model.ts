import type { JsonValue } from '@pressly/codec';
import type { CommandContext } from '@pressly/kernel';
import type { UserProfile } from '../../../foundations/language/users/user-profile.value.ts';

export type ResolveCanonicalSourceUserCommand = Readonly<{
  businessId: string;
  source: string;
  externalUserId: string;
  profile: UserProfile;
  revision: Readonly<{
    at: Date;
    hash: string;
    adapterVersion: string;
    observedAt: Date;
    normalizedPayload: JsonValue;
  }>;
  idempotencyKey: string;
  context: CommandContext;
  now: Date;
}>;

export type ResolvedCanonicalSourceUser = Readonly<{
  userId: string;
  created: boolean;
}>;
