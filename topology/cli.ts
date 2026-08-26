import {
  composePresslyCliRuntime,
  resolvePresslyCliRuntimeInvocation,
  type PresslyCliRuntimeAssemblyInput,
} from './runtime/cli/public.js';
import { makeCliCatalogFromOwners } from './runtime/cli/catalog.js';

export const resolveCliRuntimeInvocation = (argv: readonly string[]) =>
  resolvePresslyCliRuntimeInvocation(argv);

export const composeCliRuntime = (input: PresslyCliRuntimeAssemblyInput) =>
  composePresslyCliRuntime(input, makeCliCatalogFromOwners);

export { makeCliCatalogFromOwners } from './runtime/cli/catalog.js';
export { createPresslyDatabase } from './database.js';
