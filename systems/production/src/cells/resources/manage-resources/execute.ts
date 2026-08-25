import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  decideManageResourcesResult,
  hashProductionBootstrapManifest,
  validateProductionBootstrapManifest,
} from './decide.ts';
import type {
  ManageResourcesCommand,
  ManageResourcesExpectedFailure,
  ManageResourcesResult,
  ProductionBootstrapManifest,
  StoredProductionResources,
} from './types.ts';

export type ManageResourcesWorkEventCommand = Readonly<{
  operation: 'production_resources_bootstrapped';
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'production_resource_manifest';
    entityId: string;
  }>;
  expectedVersion: null;
  payload: Readonly<{
    dryRun: boolean;
    configurationHash: string;
  }>;
}>;

export type ManageResourcesReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: ManageResourcesResult }>;

export type ManageResourcesIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: ManageResourcesWorkEventCommand,
  ) => ManageResourcesReplay;
}>;

export type ApplyProductionResourcesInput = Readonly<{
  manifest: ProductionBootstrapManifest;
  result: ManageResourcesResult;
  actorId: string;
  idempotencyKey: string;
  idempotency: ManageResourcesWorkEventCommand;
  now: Date;
}>;

export type ManageResourcesTransactionRepository<StoredWorkEvent> = Readonly<{
  findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  loadResources: (locationId: string) => Promise<StoredProductionResources>;
  applyResources: (input: ApplyProductionResourcesInput) => Promise<void>;
}>;

export type ManageResourcesRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: ManageResourcesTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<ManageResourcesResult, ManageResourcesExpectedFailure>
    >,
  ) => Promise<
    CellOutcome<ManageResourcesResult, ManageResourcesExpectedFailure>
  >;
}>;

export type ManageResourcesDependencies<StoredWorkEvent> = Readonly<{
  repo: ManageResourcesRepository<StoredWorkEvent>;
  idempotency: ManageResourcesIdempotency<StoredWorkEvent>;
  clock: Readonly<{ now: () => Date }>;
}>;

export type ExecuteManageResources = (
  command: ManageResourcesCommand,
) => Promise<
  CellOutcome<ManageResourcesResult, ManageResourcesExpectedFailure>
>;

const success = (
  value: ManageResourcesResult,
): CellOutcome<ManageResourcesResult, ManageResourcesExpectedFailure> => ({
  kind: 'success',
  value,
});

const failure = (
  value: ManageResourcesExpectedFailure,
): CellOutcome<ManageResourcesResult, ManageResourcesExpectedFailure> => ({
  kind: 'failure',
  failure: value,
});

const idempotencyConflict = (): ManageResourcesExpectedFailure => ({
  kind: 'conflict',
  code: 'production_idempotency_conflict',
  message: 'The idempotency key belongs to a different production command.',
  safeMessage: 'The idempotency key belongs to a different production command.',
});

const workEventCommand = (
  command: ManageResourcesCommand,
  configurationHash: string,
): ManageResourcesWorkEventCommand => ({
  operation: 'production_resources_bootstrapped',
  locationId: command.manifest.location.id,
  actorId: command.actorId,
  target: {
    entityType: 'production_resource_manifest',
    entityId: command.manifest.location.id,
  },
  expectedVersion: null,
  payload: { dryRun: command.dryRun, configurationHash },
});

export const makeExecuteManageResources =
  <StoredWorkEvent>(
    deps: ManageResourcesDependencies<StoredWorkEvent>,
  ): ExecuteManageResources =>
  async (command) => {
    const invalid = validateProductionBootstrapManifest(command.manifest);
    if (invalid !== null) return failure(invalid);

    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = workEventCommand(
          command,
          hashProductionBootstrapManifest(command.manifest),
        );
        if (!command.dryRun) {
          const replay = deps.idempotency.resolveReplay(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
          if (replay.kind === 'conflict') return failure(idempotencyConflict());
          if (replay.kind === 'replay') return success(replay.result);
        }

        await repo.lockLocationScheduling(command.manifest.location.id);

        if (!command.dryRun) {
          const lockedReplay = deps.idempotency.resolveReplay(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
          if (lockedReplay.kind === 'conflict')
            return failure(idempotencyConflict());
          if (lockedReplay.kind === 'replay')
            return success(lockedReplay.result);
        }

        const outcome = decideManageResourcesResult({
          command,
          configurationHash: hashProductionBootstrapManifest(command.manifest),
          stored: await repo.loadResources(command.manifest.location.id),
        });
        if (outcome.status === 'converged' && !command.dryRun)
          await repo.applyResources({
            manifest: command.manifest,
            result: outcome,
            actorId: command.actorId,
            idempotencyKey: command.idempotencyKey,
            idempotency,
            now: deps.clock.now(),
          });
        return success(outcome);
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_bootstrap_failed',
          message: 'Production resources could not be bootstrapped.',
          safeMessage: 'Production resources could not be bootstrapped.',
          status: 503,
          cause,
        }),
      );
    }
  };
