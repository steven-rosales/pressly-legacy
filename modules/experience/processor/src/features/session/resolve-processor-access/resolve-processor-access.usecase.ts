import type { Clock } from '@pressly/time';
import type {
  ProcessorAccess,
  ProcessorApplicationOrigins,
  ProcessorSession,
} from '../../../foundations/language/processor-access/processor-access.model.ts';
import type { ProcessorAccessLocationsPort } from '../../../foundations/ports/processor-access-locations/processor-access-locations.port.ts';
import type { ProductionCapabilitiesPort } from '../../../foundations/ports/production-capabilities/production-capabilities.port.ts';
import { resolveProcessorAccess } from './resolve-processor-access.policy.ts';

export type ResolveProcessorAccess = (
  session: ProcessorSession,
) => Promise<ProcessorAccess | null>;

export const makeResolveProcessorAccess =
  (deps: {
    locations: ProcessorAccessLocationsPort;
    capabilities: ProductionCapabilitiesPort;
    origins: ProcessorApplicationOrigins;
    clock: Clock;
  }): ResolveProcessorAccess =>
  async (session) =>
    resolveProcessorAccess({
      session,
      locations: await deps.locations.listActive(),
      origins: deps.origins,
      now: deps.clock.now(),
      resolveCapabilities: deps.capabilities.resolveForLocation,
    });
