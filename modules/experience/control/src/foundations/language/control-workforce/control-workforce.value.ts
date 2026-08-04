export type ControlWorkforceRole = 'owner' | 'manager' | 'operator';

export type ControlWorkforceScope = Readonly<{
  kind: 'business' | 'location';
  id: string;
}>;

export type ControlMembershipState = 'active' | 'suspended' | 'ended';

export type ControlInvitationState =
  | 'pending'
  | 'accepted'
  | 'revoked'
  | 'expired';

export type ControlGrantState = 'active' | 'revoked' | 'expired';

export type ControlActorReference = Readonly<{
  identityId: string;
  sessionId: string;
}>;
