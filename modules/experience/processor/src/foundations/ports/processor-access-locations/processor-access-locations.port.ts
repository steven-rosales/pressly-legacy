import type { ProcessorLocationAuthority } from '../../language/processor-access/processor-access.model.ts';

export type ProcessorAccessLocationsPort = Readonly<{
  listActive: () => Promise<readonly ProcessorLocationAuthority[]>;
}>;
