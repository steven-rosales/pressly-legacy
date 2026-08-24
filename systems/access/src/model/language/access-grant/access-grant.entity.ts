import type {
  WorkforceRole,
  WorkforceScope,
} from '../workforce/workforce.model.ts';
import type { AccessGrantState } from './access-grant.lifecycle.ts';

export type AccessGrantEntity = Readonly<{
  id: string;
  businessId: string;
  membershipId: string;
  identityId: string;
  role: WorkforceRole;
  scope: WorkforceScope;
  state: AccessGrantState;
  version: number;
  startsAt: Date | null;
  endsAt: Date | null;
}>;
