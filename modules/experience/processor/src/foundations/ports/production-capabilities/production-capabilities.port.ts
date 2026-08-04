import type {
  ProcessorCapability,
  ProcessorLocationAuthority,
  ProcessorSession,
} from '../../language/processor-access/processor-access.model.ts';

export type ResolveProductionCapabilities = (input: {
  session: ProcessorSession;
  location: ProcessorLocationAuthority;
  now: Date;
}) => readonly Exclude<ProcessorCapability, 'processor:view'>[];

export type ProductionCapabilitiesPort = Readonly<{
  resolveForLocation: ResolveProductionCapabilities;
}>;
