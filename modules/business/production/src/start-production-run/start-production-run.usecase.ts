import { result } from '@pressly/kernel';
import type { ProductionMutationResult } from '@pressly/contracts';
import {
  productionError,
  productionIdempotencyConflict,
} from '../production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../production-idempotency.policy.ts';
import type { ClockPort } from '../production.port.ts';
import type {
  StartProductionRun,
  StartProductionRunRepository,
} from './start-production-run.port.ts';
export type { StartProductionRun } from './start-production-run.port.ts';

export const makeStartProductionRun =
  (deps: {
    repo: StartProductionRunRepository;
    clock: ClockPort;
  }): StartProductionRun =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'production_run_started',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_run',
          entityId: command.productionRunId,
          expectedVersion: command.expectedVersion,
        });
        const replay = resolveWorkEventReplay<ProductionMutationResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        const run = await repo.loadRun(
          command.locationId,
          command.productionRunId,
        );
        if (run === null)
          return result.err(
            productionError(
              'PRODUCTION_RUN_NOT_FOUND',
              'The production run was not found.',
              404,
            ),
          );
        if (run.status !== 'planned' || run.version !== command.expectedVersion)
          return result.err(
            productionError(
              'PRODUCTION_RUN_VERSION_CONFLICT',
              'The production run changed before it could start.',
            ),
          );

        const mutation = await repo.startRun({
          locationId: command.locationId,
          productionRunId: command.productionRunId,
          expectedVersion: command.expectedVersion,
          actorId: command.actorId,
          now: deps.clock.now(),
        });
        if (mutation === null)
          return result.err(
            productionError(
              'PRODUCTION_RUN_VERSION_CONFLICT',
              'The production run changed before it could start.',
            ),
          );

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_run_started',
          entityType: 'production_run',
          entityId: command.productionRunId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: { version: mutation.version },
          idempotency: { command: idempotency, result: mutation },
        });

        return result.ok(mutation);
      });
    } catch (error) {
      return result.err(
        productionError(
          'PRODUCTION_RUN_START_FAILED',
          'The production run could not be started.',
          500,
          error,
        ),
      );
    }
  };
