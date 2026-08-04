import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import type { Clock } from '@pressly/time';
import type { MfaManagementStore } from '../../../foundations/ports/mfa-store/mfa-management-store.port.ts';
import type { MfaMutation, RemoveMfaCommand } from './remove-mfa.model.ts';

export type RemoveMfa = (command: RemoveMfaCommand) => Promise<MfaMutation>;

export const makeRemoveMfa =
  (deps: {
    store: MfaManagementStore;
    clock: Clock;
    securityEvents?: SecurityEventSink;
  }): RemoveMfa =>
  async ({ identityId, sessionId, requestId }) => {
    const now = deps.clock.now();
    await deps.store.removeMfa({
      identityId,
      sessionId,
      now,
    });
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

    return { updated: true };
  };
