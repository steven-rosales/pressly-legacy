import type { Clock } from '@pressly/time';
import type {
  ProcessorAccess,
  ProcessorApplicationOrigins,
  ProcessorSession,
} from './resolve-processor-access.model.ts';
import { resolveProcessorAccess } from './resolve-processor-access.policy.ts';
import type {
  ListProcessorAccessLocations,
  ResolveProductionCapabilities,
} from './resolve-processor-access.port.ts';

export type ResolveProcessorAccess = (
  session: ProcessorSession,
) => Promise<ProcessorAccess | null>;

export const makeResolveProcessorAccess =
  (deps: {
    listLocations: ListProcessorAccessLocations;
    resolveCapabilities: ResolveProductionCapabilities;
    origins: ProcessorApplicationOrigins;
    clock: Clock;
  }): ResolveProcessorAccess =>
  async (session) =>
    resolveProcessorAccess({
      session,
      locations: await deps.listLocations(),
      origins: deps.origins,
      now: deps.clock.now(),
      resolveCapabilities: deps.resolveCapabilities,
    });
