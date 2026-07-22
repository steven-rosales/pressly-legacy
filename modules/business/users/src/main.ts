import type { Database } from '@pressly/db';
import { makePostgresCreateUserRepository } from './create-user/create-user.repo.ts';
import { makeCreateUser } from './create-user/create-user.usecase.ts';
import { makePostgresFollowUserSourceFieldRepository } from './follow-user-source-field/follow-user-source-field.repo.ts';
import { makeFollowUserSourceField } from './follow-user-source-field/follow-user-source-field.usecase.ts';
import { makePostgresObserveUserSourceRepository } from './observe-user-source/observe-user-source.repo.ts';
import { makeObserveUserSource } from './observe-user-source/observe-user-source.usecase.ts';
import { makePostgresRecordUserConsentRepository } from './record-user-consent/record-user-consent.repo.ts';
import { makeRecordUserConsent } from './record-user-consent/record-user-consent.usecase.ts';
import { makePostgresResolveUserSourceRepository } from './resolve-user-source/resolve-user-source.repo.ts';
import { makeResolveUserSource } from './resolve-user-source/resolve-user-source.usecase.ts';
import { makePostgresUpdateUserRepository } from './update-user/update-user.repo.ts';
import { makeUpdateUser } from './update-user/update-user.usecase.ts';
import type { UserClockPort } from './users.port.ts';

export type UsersApplicationDeps = Readonly<{
  db: Database;
  clock: UserClockPort;
}>;

export const makePostgresUsersApplication = (deps: UsersApplicationDeps) => {
  const sourceRepo = makePostgresObserveUserSourceRepository(deps.db);
  const createRepo = makePostgresCreateUserRepository(deps.db);
  const updateRepo = makePostgresUpdateUserRepository(deps.db);
  const followSourceRepo = makePostgresFollowUserSourceFieldRepository(deps.db);
  const consentRepo = makePostgresRecordUserConsentRepository(deps.db);
  const resolutionRepo = makePostgresResolveUserSourceRepository(deps.db);
  return {
    observeSource: makeObserveUserSource(sourceRepo),
    createUser: makeCreateUser({ repo: createRepo, clock: deps.clock }),
    updateUser: makeUpdateUser({ repo: updateRepo, clock: deps.clock }),
    followSourceField: makeFollowUserSourceField({
      repo: followSourceRepo,
      clock: deps.clock,
    }),
    recordConsent: makeRecordUserConsent(consentRepo),
    resolveSource: makeResolveUserSource(resolutionRepo),
  };
};

export type UsersApplication = ReturnType<typeof makePostgresUsersApplication>;
