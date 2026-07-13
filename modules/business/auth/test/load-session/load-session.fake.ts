import { type AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';

import type {
  LoadSessionStore,
  StoredSessionPrincipalRecord,
} from '../../src/load-session/load-session.port.ts';
import { makeDefaultStoredSessionPrincipal } from '../support/builders.ts';

export type FakeLoadSessionStoreOptions = Readonly<{
  principal?: StoredSessionPrincipalRecord | undefined;
  findByTokenHashResult?: Result<
    StoredSessionPrincipalRecord | undefined,
    AppError
  >;
  touchSessionResult?: Result<void, AppError>;
}>;

export const makeFakeLoadSessionStore = (
  options: FakeLoadSessionStoreOptions = {},
) => {
  const principal =
    'principal' in options
      ? options.principal
      : makeDefaultStoredSessionPrincipal();

  const calls = {
    findByTokenHash: [] as string[],
    touchSession: [] as Array<{ sessionId: string; now: Date }>,
  };

  const store: LoadSessionStore = {
    async findByTokenHash(tokenHash) {
      calls.findByTokenHash.push(tokenHash);
      return options.findByTokenHashResult ?? result.ok(principal);
    },
    async touchSession(sessionId, now) {
      calls.touchSession.push({ sessionId, now });
      return options.touchSessionResult ?? result.ok(undefined);
    },
  };

  return { store, calls };
};
