import { defineOperation } from '@pressly/cells';
import { resolveSourceLocationContract } from './contract.ts';
import { makeExecuteResolveSourceLocation } from './execute.ts';
import {
  resolveSourceLocationOperationId,
  type ResolveSourceLocationExpectedFailure,
  type ResolveSourceLocationInput,
  type ResolveSourceLocationRepository,
  type ResolveSourceLocationResult,
} from './types.ts';

export const resolveSourceLocationCellDeclaration = defineOperation<
  ResolveSourceLocationInput,
  ResolveSourceLocationResult,
  ResolveSourceLocationExpectedFailure
>({
  kind: 'query',
  id: resolveSourceLocationOperationId,
  authentication: 'none',
  contract: resolveSourceLocationContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'ingress.resolve_source_location' },
});

export const makeResolveSourceLocationCell = (
  repo: ResolveSourceLocationRepository,
) =>
  defineOperation(
    resolveSourceLocationCellDeclaration,
    makeExecuteResolveSourceLocation(repo),
  );
