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
