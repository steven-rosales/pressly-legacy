import type { ProcessorOperationalOrderIdentity } from '@pressly/contracts/processor';
import { invariantViolationError } from '@pressly/errors/factories';

export const requireOperationalOrderIdentity = (
  identities: ReadonlyMap<string, ProcessorOperationalOrderIdentity>,
  referenceId: string,
): ProcessorOperationalOrderIdentity => {
  const identity = identities.get(referenceId);
  if (identity === undefined)
    throw invariantViolationError({
      code: 'processor_order_identity_unresolved',
      message: `Processor order identity was not resolved for ${referenceId}.`,
    });
  return identity;
};
