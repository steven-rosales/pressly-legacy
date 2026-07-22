import type { UserSourceIdentity } from '../users.port.ts';

export type ResolveUserSourceRepository = Readonly<{
  resolveSource: (
    identity: UserSourceIdentity,
  ) => Promise<Readonly<{ userId: string }> | null>;
}>;
