import type {
  ProcessorCapability,
  ProcessorLocationAuthority,
  ProcessorSession,
} from './resolve-processor-access.model.ts';

export type ListProcessorAccessLocations = () => Promise<
  readonly ProcessorLocationAuthority[]
>;

export type ResolveProductionCapabilities = (input: {
  session: ProcessorSession;
  location: ProcessorLocationAuthority;
  now: Date;
}) => readonly Exclude<ProcessorCapability, 'processor:view'>[];
