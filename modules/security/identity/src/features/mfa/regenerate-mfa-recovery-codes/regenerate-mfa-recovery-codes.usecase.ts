import type { RecoveryCodeService } from '@pressly/auth/credentials';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import type { Clock } from '@pressly/time';
import type { MfaRecoveryCodes } from '../../../foundations/language/mfa/mfa.model.ts';
import type { MfaManagementStore } from '../../../foundations/ports/mfa-store/mfa-management-store.port.ts';
import type { RegenerateMfaRecoveryCodesCommand } from './regenerate-mfa-recovery-codes.model.ts';

export type RegenerateMfaRecoveryCodes = (
  command: RegenerateMfaRecoveryCodesCommand,
) => Promise<MfaRecoveryCodes>;

export const makeRegenerateMfaRecoveryCodes =
  (deps: {
    store: MfaManagementStore;
    recoveryCodes: RecoveryCodeService;
    clock: Clock;
    securityEvents?: SecurityEventSink;
  }): RegenerateMfaRecoveryCodes =>
  async ({ identityId, requestId }) => {
    const now = deps.clock.now();
    const recoveryCodes = deps.recoveryCodes.generate(10);
    await deps.store.replaceRecoveryCodes({
      identityId,
      recoveryCodeHashes: recoveryCodes.map(deps.recoveryCodes.hash),
      now,
    });
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

    return { recoveryCodes: [...recoveryCodes] };
  };
