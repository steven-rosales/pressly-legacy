import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlGrant } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import { toControlGrant } from '../../../foundations/language/control-workforce/control-workforce.projection.ts';
import type { RevokeControlAccessPort } from './revoke-control-access.port.ts';

export type RevokeControlAccess = (input: {
  context: ControlRequestContext;
  grantId: string;
  expectedVersion: number;
  idempotencyKey: string;
  reason?: string;
}) => Promise<
  Result<
    Readonly<{
      grant: ControlGrant;
      revokedSessionCount: number;
    }>,
    ControlWorkforceRejection
  >
>;

export const makeRevokeControlAccess =
  (revokeAccess: RevokeControlAccessPort): RevokeControlAccess =>
  async ({ context, ...command }) => {
    const revoked = await revokeAccess({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(revoked)
      ? revoked
      : result.ok({
          grant: toControlGrant(revoked.value.grant),
          revokedSessionCount: revoked.value.revokedSessionCount,
        });
  };
