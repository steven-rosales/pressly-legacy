import { result, type Result } from '@pressly/kernel';
import {
  decideSourceRevision,
  maySourceWriteField,
} from '../user-source-ordering.policy.ts';
import type {
  UserFieldName,
  UserProfile,
  UserSourceObservation,
} from '../users.port.ts';
import { userProfileFields } from '../user-profile.policy.ts';
import type { StoredUserSourceState } from './observe-user-source.port.ts';

export type UserSourceUpdateDecision =
  | Readonly<{ kind: 'replay' }>
  | Readonly<{ kind: 'stale' }>
  | Readonly<{
      kind: 'apply';
      changes: Partial<UserProfile>;
      nextProfile: UserProfile;
      nextVersion: number;
      missingAuthorities: readonly UserFieldName[];
    }>;

export const decideUserSourceUpdate = (input: {
  current: StoredUserSourceState;
  observation: UserSourceObservation;
}): Result<UserSourceUpdateDecision, 'source_conflict'> => {
  const revision = decideSourceRevision(input.current.revision, {
    at: input.observation.revision.at,
    hash: input.observation.revision.hash,
  });
  if (revision.tag === 'err') return result.err('source_conflict');
  if (revision.value !== 'apply') return result.ok({ kind: revision.value });

  const changes: Partial<UserProfile> = {};
  const missingAuthorities: UserFieldName[] = [];
  for (const field of userProfileFields) {
    const authority = input.current.authorities.get(field) ?? null;
    if (maySourceWriteField(authority, input.observation.source))
      Object.assign(changes, { [field]: input.observation.profile[field] });
    if (authority === null) missingAuthorities.push(field);
  }
  return result.ok({
    kind: 'apply',
    changes,
    nextProfile: { ...input.current.user, ...changes },
    nextVersion: input.current.user.version + 1,
    missingAuthorities,
  });
};
