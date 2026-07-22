import type { Database } from '@pressly/db';
import { resolveStoredUserSource } from '../persistence/postgres-user.shared.ts';
import type { ResolveUserSourceRepository } from './resolve-user-source.port.ts';

export const makePostgresResolveUserSourceRepository = (
  db: Database,
): ResolveUserSourceRepository => ({
  resolveSource: (identity) => resolveStoredUserSource(db, identity),
});
