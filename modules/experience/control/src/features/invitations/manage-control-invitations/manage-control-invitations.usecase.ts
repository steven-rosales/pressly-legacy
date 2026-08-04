import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type {
  ControlInvitation,
  ControlInvitationAcceptance,
  ControlInvitationPage,
  ControlInvitationPreview,
  ControlIssueInvitation,
} from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type { ControlWorkforceRole } from '../../../foundations/language/control-workforce/control-workforce.value.ts';
import type {
  ControlWorkforcePort,
  ControlWorkforceRejection,
} from '../../../foundations/ports/control-workforce/control-workforce.port.ts';
import {
  toControlInvitation,
  toControlInvitationAcceptance,
  toControlInvitationPreview,
  toControlIssueInvitation,
} from './control-invitation.projection.mapper.ts';

type InvitationResult<Value> = Promise<
  Result<Value, ControlWorkforceRejection>
>;

export type ControlInvitationsApplication = Readonly<{
  list: (input: {
    context: ControlRequestContext;
    includeTerminal: boolean;
    cursor?: string;
    limit: number;
  }) => InvitationResult<ControlInvitationPage>;
  issue: (input: {
    context: ControlRequestContext;
    email: string;
    displayName: string;
    intendedRole: ControlWorkforceRole;
    intendedLocationId: string | null;
    idempotencyKey: string;
  }) => InvitationResult<ControlIssueInvitation>;
  reissue: (input: {
    context: ControlRequestContext;
    invitationId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }) => InvitationResult<ControlIssueInvitation>;
  revoke: (input: {
    context: ControlRequestContext;
    invitationId: string;
    expectedVersion: number;
    idempotencyKey: string;
    reason?: string;
  }) => InvitationResult<ControlInvitation>;
  preview: (
    acceptanceToken: string,
  ) => InvitationResult<ControlInvitationPreview>;
  accept: (input: {
    acceptanceToken: string;
    idempotencyKey: string;
    acceptance:
      | Readonly<{ kind: 'new_identity'; password: string }>
      | Readonly<{
          kind: 'existing_identity';
          authenticatedIdentityId: string;
          authenticatedSessionId: string;
        }>;
  }) => InvitationResult<ControlInvitationAcceptance>;
}>;

export const makeControlInvitationsApplication = (
  workforce: ControlWorkforcePort,
): ControlInvitationsApplication => ({
  list: async ({ context, ...query }) => {
    const page = await workforce.listInvitations({
      ...query,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(page)
      ? page
      : result.ok({
          invitations: page.value.invitations.map(toControlInvitation),
          nextCursor: page.value.nextCursor,
        });
  },
  issue: async ({ context, ...command }) => {
    const issued = await workforce.issueInvitation({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(issued)
      ? issued
      : result.ok(toControlIssueInvitation(issued.value));
  },
  reissue: async ({ context, ...command }) => {
    const issued = await workforce.reissueInvitation({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(issued)
      ? issued
      : result.ok(toControlIssueInvitation(issued.value));
  },
  revoke: async ({ context, ...command }) => {
    const revoked = await workforce.revokeInvitation({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(revoked)
      ? revoked
      : result.ok(toControlInvitation(revoked.value));
  },
  preview: async (acceptanceToken) => {
    const preview = await workforce.previewInvitation(acceptanceToken);
    return result.isErr(preview)
      ? preview
      : result.ok(toControlInvitationPreview(preview.value));
  },
  accept: async (command) => {
    const accepted = await workforce.acceptInvitation(command);
    return result.isErr(accepted)
      ? accepted
      : result.ok(toControlInvitationAcceptance(accepted.value));
  },
});
