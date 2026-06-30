import type {
  MfaMutationResult,
  MfaRecoveryCodesResult,
} from '@pressly/contracts';
import type { RecoveryCodeService } from '@pressly/auth/credentials';
import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import type { Clock, MfaStore } from './mfa.port.ts';

export type RegenerateMfaRecoveryCodes = (
  command: Readonly<{ identityId: string; requestId?: string }>,
) => Promise<Result<MfaRecoveryCodesResult, AppError>>;

export type RemoveMfa = (command: {
  identityId: string;
  sessionId: string;
  requestId?: string;
}) => Promise<Result<MfaMutationResult, AppError>>;

export const makeRegenerateMfaRecoveryCodes =
  (deps: {
    store: MfaStore;
    recoveryCodes: RecoveryCodeService;
    clock: Clock;
    securityEvents?: SecurityEventSink;
  }): RegenerateMfaRecoveryCodes =>
  async ({ identityId, requestId }) => {
    const now = deps.clock.now();
    const recoveryCodes = deps.recoveryCodes.generate(10);
    const replaced = await deps.store.replaceRecoveryCodes({
      identityId,
      recoveryCodeHashes: recoveryCodes.map(deps.recoveryCodes.hash),
      now,
    });
    if (result.isErr(replaced)) return replaced;

    (deps.securityEvents ?? nullSecurityEventSink).emit({
      name: 'privileged.mutation',
      occurredAt: now.toISOString(),
      outcome: 'succeeded',
      ...(requestId === undefined ? {} : { requestId }),
      principalId: identityId,
      action: 'auth:mfa:recovery_codes_regenerated',
      resourceType: 'auth.identity',
      resourceId: identityId,
    });

    return result.ok({ recoveryCodes: [...recoveryCodes] });
  };

export const makeRemoveMfa =
  (deps: {
    store: MfaStore;
    clock: Clock;
    securityEvents?: SecurityEventSink;
  }): RemoveMfa =>
  async ({ identityId, sessionId, requestId }) => {
    const now = deps.clock.now();
    const removed = await deps.store.removeMfa({
      identityId,
      sessionId,
      now,
    });
    if (result.isErr(removed)) return removed;

    (deps.securityEvents ?? nullSecurityEventSink).emit({
      name: 'privileged.mutation',
      occurredAt: now.toISOString(),
      outcome: 'succeeded',
      ...(requestId === undefined ? {} : { requestId }),
      principalId: identityId,
      sessionId,
      action: 'auth:mfa:removed',
      resourceType: 'auth.identity',
      resourceId: identityId,
    });

    return result.ok({ updated: true });
  };
