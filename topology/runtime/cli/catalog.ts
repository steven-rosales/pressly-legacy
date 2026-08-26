import {
  defineCliCatalog,
  type ExecutableCell,
  type ExecutableCliCatalog,
} from '@pressly/cells';
import type { PresslyCliRuntimeOwners } from './composition.js';
import { presslyAdminCliProgram } from '@pressly/experience-control';

const executableCells = (owner: { readonly cells: object }): ExecutableCell[] =>
  Object.values(owner.cells).filter(
    (value): value is ExecutableCell =>
      typeof value === 'object' &&
      value !== null &&
      'execute' in value &&
      typeof value.execute === 'function' &&
      value.kind !== 'subscription',
  );

export const makeCliCatalogFromOwners = (
  owners: PresslyCliRuntimeOwners,
): ExecutableCliCatalog =>
  defineCliCatalog(
    [
      ...executableCells(owners['system:access']),
      ...executableCells(owners['experience:control']),
    ],
    presslyAdminCliProgram,
  );
