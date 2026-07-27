import type {
  ReplaceProductionShiftSelectionCommand,
  ReplaceProductionShiftSelectionResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  Transactional,
  WorkEventInput,
  ScheduleSupersessionDecision,
} from '../production.port.ts';

export type ReplaceShiftOrderSelection = (
  command: ReplaceProductionShiftSelectionCommand &
    Readonly<{ actorId: string }>,
) => Promise<Result<ReplaceProductionShiftSelectionResult, AppError>>;

export type LockedShiftOrderSelection = Readonly<{
  state: 'available' | 'not_found' | 'run_exists';
  version: number;
  selectedOrderIds: readonly string[];
  currentSchedule: Readonly<{
    scheduleRunId: string;
    status: string;
  }> | null;
}>;

export type ReplaceShiftOrderSelectionRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    lockSelection: (
      locationId: string,
      productionShiftId: string,
    ) => Promise<LockedShiftOrderSelection>;
    selectedOrdersAreReady: (
      locationId: string,
      productionOrderIds: readonly string[],
    ) => Promise<boolean>;
    replaceSelection: (input: {
      locationId: string;
      productionShiftId: string;
      selectedOrderIds: readonly string[];
      currentVersion: number;
      supersede: ScheduleSupersessionDecision | null;
      actorId: string;
      now: Date;
    }) => Promise<ReplaceProductionShiftSelectionResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
