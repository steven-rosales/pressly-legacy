import type { Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlSecurityEventList } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ReadControlSecurityEventsPort } from './read-control-security-events.port.ts';

export type ReadControlSecurityEvents = (input: {
  context: ControlRequestContext;
  cursor?: string;
  limit: number;
}) => Promise<Result<ControlSecurityEventList, ControlWorkforceRejection>>;

export const makeReadControlSecurityEvents =
  (
    readSecurityEvents: ReadControlSecurityEventsPort,
  ): ReadControlSecurityEvents =>
  async ({ context, ...query }) => {
    const events = await readSecurityEvents({
      ...query,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return events;
  };
