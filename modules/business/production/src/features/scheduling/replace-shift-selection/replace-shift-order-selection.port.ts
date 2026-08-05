import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type { ScheduleSupersessionDecision } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type {
  ReplaceShiftOrderSelectionCommand,
  ReplaceShiftOrderSelectionResult,
} from './replace-shift-order-selection.model.ts';

export type ReplaceShiftOrderSelection = (
  command: ReplaceShiftOrderSelectionCommand & Readonly<{ actorId: string }>,
) => Promise<
  Result<ReplaceShiftOrderSelectionResult, ProductionFeatureFailure>
>;

export type LockedShiftOrderSelection = Readonly<{
  state: 'available' | 'not_found' | 'run_exists';
  version: number;
  selectedOrderIds: readonly string[];
  currentSchedule: Readonly<{
    scheduleRunId: string;
    status: string;
  }> | null;
}>;

export type ReplaceShiftOrderSelectionRepository = UnitOfWork<
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
    }) => Promise<ReplaceShiftOrderSelectionResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
