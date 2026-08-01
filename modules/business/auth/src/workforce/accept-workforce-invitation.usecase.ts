import {
  validatePasswordStrength,
  type PasswordHasher,
} from '@pressly/auth/credentials';
import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import {
  weakInvitationPassword,
  workforceStoreFailure,
} from '../workforce.error.ts';
import {
  commandFingerprint,
  requireIdentifier,
} from '../workforce-validation.policy.ts';
import type {
  AcceptedInvitation,
  InvitationTokenService,
  WorkforceClock,
  WorkforceInvitationStore,
} from './workforce-invitation.port.ts';

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
) => Promise<Result<AcceptWorkforceInvitationResult, AppError>>;

export const makeAcceptWorkforceInvitation =
  (deps: {
    store: WorkforceInvitationStore;
    tokenService: InvitationTokenService;
    passwordHasher: PasswordHasher;
    clock: WorkforceClock;
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
      if (result.isErr(passwordHash)) return passwordHash;
      acceptance = {
        kind: 'new_identity',
        passwordHash: passwordHash.value,
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

    if (result.isErr(accepted)) return accepted;
    if (accepted.value.status === 'rejected')
      return result.err(
        workforceStoreFailure(
          accepted.value.reason,
          accepted.value.currentVersion,
        ),
      );

    return result.ok({
      ...accepted.value.value,
      replayed: accepted.value.status === 'replayed',
    });
  };
