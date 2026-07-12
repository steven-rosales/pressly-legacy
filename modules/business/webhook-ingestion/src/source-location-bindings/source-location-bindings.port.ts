import type {
  ManageSourceLocationBindingsResult,
  SourceLocationBindingResourceInput,
  SourceLocationBindingsManifest,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type StoredSourceLocationBinding = SourceLocationBindingResourceInput;

export type ResolveSourceLocation = (query: {
  source: string;
  externalLocationId: string;
}) => Promise<string | null>;

export type ManageSourceLocationBindings = (command: {
  manifest: SourceLocationBindingsManifest;
  dryRun: boolean;
}) => Promise<Result<ManageSourceLocationBindingsResult, AppError>>;

export type SourceLocationBindingsRepository = Readonly<{
  resolve: ResolveSourceLocation;
  loadAll: () => Promise<readonly StoredSourceLocationBinding[]>;
  insert: (
    bindings: readonly SourceLocationBindingResourceInput[],
    now: Date,
  ) => Promise<void>;
}>;
