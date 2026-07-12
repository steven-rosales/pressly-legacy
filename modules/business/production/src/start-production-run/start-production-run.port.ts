import type {
  ProductionMutationResult,
  ProductionRunCommand,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type StartProductionRun = (
  command: ProductionRunCommand & { locationId: string; actorId: string },
) => Promise<Result<ProductionMutationResult, AppError>>;

export type StartProductionRunRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    loadRun: (
      locationId: string,
      productionRunId: string,
    ) => Promise<Readonly<{
      id: string;
      status: 'planned' | 'started' | 'completed';
      version: number;
    }> | null>;
    startRun: (input: {
      locationId: string;
      productionRunId: string;
      expectedVersion: number;
      actorId: string;
      now: Date;
    }) => Promise<ProductionMutationResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
