import type {
  WorkspaceRunRow,
  WorkspaceSelection,
  WorkspaceSelectionSchedule,
  WorkspaceShiftCandidate,
  WorkspaceShiftRow,
} from './types.ts';

export const isActionableWorkspaceSchedule = (input: {
  schedule: Readonly<{ id: string; status: string }>;
  shift: Readonly<{ status: string; endsAt: Date }> | undefined;
  committedScheduleRunIds: ReadonlySet<string>;
  now: Date;
}): boolean =>
  input.shift !== undefined &&
  input.shift.status === 'open' &&
  input.shift.endsAt > input.now &&
  (input.schedule.status === 'draft' || input.schedule.status === 'accepted') &&
  !input.committedScheduleRunIds.has(input.schedule.id);

export const selectWorkspaceShift = <
  Schedule extends WorkspaceSelectionSchedule,
>(input: {
  requestedShiftId: string | undefined;
  shiftRows: readonly WorkspaceShiftRow[];
  runRows: readonly WorkspaceRunRow[];
  currentScheduleRows: readonly Schedule[];
  now: Date;
}): WorkspaceSelection<Schedule> | 'shift_not_found' => {
  const activeRunRows = input.runRows.filter((run) => run.status === 'started');
  const shiftById = new Map(input.shiftRows.map((shift) => [shift.id, shift]));
  const committedScheduleRunIds = new Set(
    input.runRows.map((run) => run.scheduleRunId),
  );
  const actionableScheduleRows = input.currentScheduleRows.filter((schedule) =>
    isActionableWorkspaceSchedule({
      schedule,
      shift: shiftById.get(schedule.productionShiftId),
      committedScheduleRunIds,
      now: input.now,
    }),
  );
  const runShiftIds = new Set(
    input.runRows.map((run) => run.productionShiftId),
  );
  const candidateShifts: WorkspaceShiftCandidate[] = [];
  let currentShift =
    input.requestedShiftId === undefined
      ? undefined
      : shiftById.get(input.requestedShiftId);

  if (input.requestedShiftId !== undefined && currentShift === undefined)
    return 'shift_not_found';

  if (input.requestedShiftId === undefined) {
    const startedCandidates = activeRunRows.flatMap((run) => {
      const shift = shiftById.get(run.productionShiftId);
      return shift === undefined ? [] : [{ shift, run }];
    });

    if (startedCandidates.length === 1)
      currentShift = startedCandidates[0]?.shift;
    else if (startedCandidates.length > 1)
      for (const { shift, run } of startedCandidates)
        candidateShifts.push({
          productionShiftId: shift.id,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          reason: 'started_run',
          productionRunId: run.id,
          scheduleRunId: run.scheduleRunId,
        });
    else {
      const acceptedCandidates = actionableScheduleRows.flatMap((schedule) => {
        if (schedule.status !== 'accepted') return [];
        const shift = shiftById.get(schedule.productionShiftId);
        return shift === undefined ? [] : [{ shift, schedule }];
      });

      if (acceptedCandidates.length === 1)
        currentShift = acceptedCandidates[0]?.shift;
      else if (acceptedCandidates.length > 1)
        for (const { shift, schedule } of acceptedCandidates)
          candidateShifts.push({
            productionShiftId: shift.id,
            startsAt: shift.startsAt,
            endsAt: shift.endsAt,
            reason: 'accepted_plan',
            productionRunId: null,
            scheduleRunId: schedule.id,
          });
      else {
        const openCandidates = input.shiftRows.filter(
          (shift) =>
            shift.status === 'open' &&
            shift.endsAt > input.now &&
            !runShiftIds.has(shift.id),
        );
        if (openCandidates.length === 1) currentShift = openCandidates[0];
        else if (openCandidates.length > 1)
          for (const shift of openCandidates)
            candidateShifts.push({
              productionShiftId: shift.id,
              startsAt: shift.startsAt,
              endsAt: shift.endsAt,
              reason: 'open_shift',
              productionRunId: null,
              scheduleRunId:
                actionableScheduleRows.find(
                  (schedule) => schedule.productionShiftId === shift.id,
                )?.id ?? null,
            });
      }
    }
  }

  return {
    currentShift,
    candidateShifts,
    activeRunRows,
    actionableScheduleRows,
  };
};
