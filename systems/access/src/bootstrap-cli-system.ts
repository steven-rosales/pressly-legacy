import { makeBootstrapOwnerCell } from './cells/bootstrap/bootstrap-owner/cell.ts';
import type { BootstrapOwner } from './cells/bootstrap/bootstrap-owner/bootstrap-owner.usecase.ts';

export type AccessBootstrapCliSystemDependencies = Readonly<{
  bootstrapOwner: BootstrapOwner;
}>;

export const makeAccessBootstrapCliSystem = (
  dependencies: AccessBootstrapCliSystemDependencies,
) =>
  Object.freeze({
    cells: Object.freeze({
      bootstrapOwner: makeBootstrapOwnerCell(dependencies.bootstrapOwner),
    }),
  });

export type AccessBootstrapCliSystem = ReturnType<
  typeof makeAccessBootstrapCliSystem
>;
