import type {
  ControlGrantState,
  ControlInvitationState,
  ControlMembershipState,
  ControlWorkforceRole,
  ControlWorkforceScope,
} from './control-workforce.value.ts';

/** A hydrated access grant whose identity and version survive projections. */
export type ControlGrantEntity = Readonly<{
  id: string;
  businessId: string;
  membershipId: string;
  identityId: string;
  role: ControlWorkforceRole;
  scope: ControlWorkforceScope;
  state: ControlGrantState;
  version: number;
  startsAt: Date | null;
  endsAt: Date | null;
  effective: boolean;
}>;

/** A hydrated invitation whose identity and lifecycle survive projections. */
export type ControlInvitationEntity = Readonly<{
  id: string;
  businessId: string;
  emailNormalized: string;
  displayName: string;
  intendedRole: ControlWorkforceRole;
  intendedLocationId: string | null;
  state: ControlInvitationState;
  version: number;
  expiresAt: Date;
  createdAt: Date;
}>;

/** A hydrated workforce membership whose identity and lifecycle are stable. */
export type ControlMembershipEntity = Readonly<{
  membershipId: string;
  businessId: string;
  identityId: string;
  displayName: string;
  email: string;
  state: ControlMembershipState;
  version: number;
  mfaEnabled: boolean;
  grants: readonly ControlGrantEntity[];
  startedAt: Date;
  suspendedAt: Date | null;
  endedAt: Date | null;
}>;
