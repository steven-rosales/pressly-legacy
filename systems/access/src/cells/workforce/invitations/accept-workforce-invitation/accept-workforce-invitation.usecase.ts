import type { PasswordHasher } from '@pressly/auth-platform/passwords';
import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import type { Clock } from '@pressly/time';
import { validatePasswordStrength } from '../../../../model/language/password-strength.ts';
import {
  weakInvitationPassword,
  workforceStoreFailure,
  type WorkforceFailure,
} from '../../../../model/language/workforce-failure/workforce-failure.failure.ts';
import {
  commandFingerprint,
  requireIdentifier,
} from '../../../../model/language/workforce-command/workforce-command.policy.ts';
import type { InvitationTokenService } from '../../../../model/ports/workforce-invitation-token/workforce-invitation-token.port.ts';
import type {
  AcceptedInvitation,
  AcceptWorkforceInvitationStore,
} from './accept-workforce-invitation.port.ts';

export type AcceptWorkforceInvitationCommand = Readonly<{
  rawToken: string;
  idempotencyKey: string;
  acceptance:
    | Readonly<{ kind: 'new_identity'; password: string }>
    | Readonly<{
        kind: 'existing_identity';
        authenticatedIdentityId: string;
        authenticatedSessionId: string;
      }>;
}>;

export type AcceptWorkforceInvitationResult = AcceptedInvitation &
  Readonly<{ replayed: boolean }>;

export type AcceptWorkforceInvitation = (
  command: AcceptWorkforceInvitationCommand,
) => Promise<Result<AcceptWorkforceInvitationResult, WorkforceFailure>>;

export const makeAcceptWorkforceInvitation =
  (deps: {
    store: AcceptWorkforceInvitationStore;
    tokenService: InvitationTokenService;
    passwordHasher: PasswordHasher;
    clock: Clock;
  }): AcceptWorkforceInvitation =>
  async (command) => {
    const rawToken = requireIdentifier(command.rawToken, 'invitation_token');
    if (result.isErr(rawToken)) return rawToken;
    const idempotencyKey = requireIdentifier(
      command.idempotencyKey,
      'idempotency_key',
    );
    if (result.isErr(idempotencyKey)) return idempotencyKey;

    let acceptance:
      | Readonly<{ kind: 'new_identity'; passwordHash: string }>
      | Readonly<{
          kind: 'existing_identity';
          authenticatedIdentityId: string;
          authenticatedSessionId: string;
        }>;

    if (command.acceptance.kind === 'new_identity') {
      const violations = validatePasswordStrength(command.acceptance.password);
      if (violations.length > 0)
        return result.err(weakInvitationPassword(violations));
      const passwordHash = await deps.passwordHasher.hash(
        command.acceptance.password,
      );
      acceptance = {
        kind: 'new_identity',
        passwordHash,
      };
    } else {
      const identityId = requireIdentifier(
        command.acceptance.authenticatedIdentityId,
        'authenticated_identity_id',
      );
      if (result.isErr(identityId)) return identityId;
      const sessionId = requireIdentifier(
        command.acceptance.authenticatedSessionId,
        'authenticated_session_id',
      );
      if (result.isErr(sessionId)) return sessionId;
      acceptance = {
        kind: 'existing_identity',
        authenticatedIdentityId: identityId.value,
        authenticatedSessionId: sessionId.value,
      };
    }

    const tokenHash = deps.tokenService.hash(rawToken.value);
    const commandHash = commandFingerprint('accept_workforce_invitation', {
      tokenHash,
      acceptanceKind: acceptance.kind,
      ...(acceptance.kind === 'existing_identity'
        ? { authenticatedIdentityId: acceptance.authenticatedIdentityId }
        : {}),
    });
    const accepted = await deps.store.accept({
      tokenHash,
      now: deps.clock.now(),
      idempotencyKey: idempotencyKey.value,
      commandHash,
      acceptance,
    });
    if (accepted.status === 'rejected')
      return result.err(
        workforceStoreFailure(accepted.reason, accepted.currentVersion),
      );

    return result.ok({
      ...accepted.value,
      replayed: accepted.status === 'replayed',
    });
  };
