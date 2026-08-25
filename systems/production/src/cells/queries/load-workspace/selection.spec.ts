import { describe, expect, it } from 'vitest';
import {
  isActionableWorkspaceSchedule,
  selectWorkspaceShift,
} from './selection.ts';
import type {
  WorkspaceRunRow,
  WorkspaceSelectionSchedule,
  WorkspaceShiftRow,
} from './types.ts';

const id = (suffix: number): string =>
  `34000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const now = new Date('2026-08-21T16:00:00.000Z');

const shift = (suffix: number, status: string = 'open'): WorkspaceShiftRow => ({
  id: id(suffix),
  locationId: 'location-1',
  startsAt: new Date(now.getTime() + suffix * 60_000),
  endsAt: new Date(now.getTime() + 8 * 60 * 60_000),
  timezone: 'America/New_York',
  effectiveFolderCount: 2,
  status,
  version: 1,
});

const run = (
  suffix: number,
  productionShiftId: string,
  status: string = 'started',
): WorkspaceRunRow => ({
  id: id(100 + suffix),
  productionShiftId,
  scheduleRunId: id(200 + suffix),
  status,
  queueVersion: 1,
  plannedCompletionAt: new Date(now.getTime() + 4 * 60 * 60_000),
  overtimeProposalHash: null,
  overtimeQueueVersion: null,
  overtimeAcknowledgedBy: null,
  overtimeAcknowledgedAt: null,
  version: 1,
  createdAt: new Date(now.getTime() + suffix * 1_000),
});

const schedule = (
  suffix: number,
  productionShiftId: string,
  status: string = 'accepted',
): WorkspaceSelectionSchedule => ({
  id: id(200 + suffix),
  productionShiftId,
  status,
  createdAt: new Date(now.getTime() + suffix * 1_000),
});

describe('load-workspace shift selection', () => {
  it('lets an explicit known shift suppress every fallback and rejects an unknown one', () => {
    const shifts = [shift(2), shift(1, 'closed')];
    const runs = [run(1, shifts[0]!.id), run(2, shifts[1]!.id)];

    expect(
      selectWorkspaceShift({
        requestedShiftId: id(999),
        shiftRows: shifts,
        runRows: runs,
        currentScheduleRows: [],
        now,
      }),
    ).toBe('shift_not_found');
    expect(
      selectWorkspaceShift({
        requestedShiftId: shifts[1]!.id,
        shiftRows: shifts,
        runRows: runs,
        currentScheduleRows: [],
        now,
      }),
    ).toMatchObject({
      currentShift: { id: shifts[1]!.id, status: 'closed' },
      candidateShifts: [],
    });
  });

  it('selects exactly one started-run shift before plans or open shifts', () => {
    const started = shift(1);
    const accepted = shift(2);
    const selected = selectWorkspaceShift({
      requestedShiftId: undefined,
      shiftRows: [accepted, started],
      runRows: [run(1, started.id)],
      currentScheduleRows: [schedule(2, accepted.id)],
      now,
    });

    expect(selected).toMatchObject({
      currentShift: { id: started.id },
      candidateShifts: [],
    });
  });

  it('returns every started-run candidate without guessing or falling through', () => {
    const newer = shift(2);
    const older = shift(1);
    const newerRun = run(2, newer.id);
    const olderRun = run(1, older.id);
    const selected = selectWorkspaceShift({
      requestedShiftId: undefined,
      shiftRows: [newer, older],
      runRows: [newerRun, olderRun],
      currentScheduleRows: [schedule(2, newer.id)],
      now,
    });

    expect(selected).toMatchObject({ currentShift: undefined });
    if (selected === 'shift_not_found') return;
    expect(selected.candidateShifts).toEqual([
      {
        productionShiftId: newer.id,
        startsAt: newer.startsAt,
        endsAt: newer.endsAt,
        reason: 'started_run',
        productionRunId: newerRun.id,
        scheduleRunId: newerRun.scheduleRunId,
      },
      {
        productionShiftId: older.id,
        startsAt: older.startsAt,
        endsAt: older.endsAt,
        reason: 'started_run',
        productionRunId: olderRun.id,
        scheduleRunId: olderRun.scheduleRunId,
      },
    ]);
  });

  it('selects one actionable accepted plan and exposes ambiguity for several', () => {
    const first = shift(2);
    const second = shift(1);
    const acceptedFirst = schedule(2, first.id);
    const acceptedSecond = schedule(1, second.id);

    expect(
      selectWorkspaceShift({
        requestedShiftId: undefined,
        shiftRows: [first, second],
        runRows: [],
        currentScheduleRows: [acceptedFirst],
        now,
      }),
    ).toMatchObject({ currentShift: { id: first.id }, candidateShifts: [] });

    const ambiguous = selectWorkspaceShift({
      requestedShiftId: undefined,
      shiftRows: [first, second],
      runRows: [],
      currentScheduleRows: [acceptedFirst, acceptedSecond],
      now,
    });
    if (ambiguous === 'shift_not_found') return;
    expect(ambiguous.currentShift).toBeUndefined();
    expect(ambiguous.candidateShifts.map(({ reason }) => reason)).toEqual([
      'accepted_plan',
      'accepted_plan',
    ]);
  });

  it('falls back to future uncommitted open shifts and associates an actionable draft', () => {
    const first = shift(2);
    const second = shift(1);
    const draft = schedule(2, first.id, 'draft');
    const one = selectWorkspaceShift({
      requestedShiftId: undefined,
      shiftRows: [first],
      runRows: [],
      currentScheduleRows: [draft],
      now,
    });
    expect(one).toMatchObject({ currentShift: { id: first.id } });

    const ambiguous = selectWorkspaceShift({
      requestedShiftId: undefined,
      shiftRows: [first, second],
      runRows: [],
      currentScheduleRows: [draft],
      now,
    });
    if (ambiguous === 'shift_not_found') return;
    expect(ambiguous.candidateShifts).toEqual([
      expect.objectContaining({
        productionShiftId: first.id,
        reason: 'open_shift',
        scheduleRunId: draft.id,
      }),
      expect.objectContaining({
        productionShiftId: second.id,
        reason: 'open_shift',
        scheduleRunId: null,
      }),
    ]);
  });

  it('excludes committed, closed, and expired schedules from actionability', () => {
    const open = shift(1);
    const accepted = schedule(1, open.id);
    expect(
      isActionableWorkspaceSchedule({
        schedule: accepted,
        shift: open,
        committedScheduleRunIds: new Set(),
        now,
      }),
    ).toBe(true);
    for (const input of [
      { shift: { ...open, status: 'closed' }, committed: new Set<string>() },
      { shift: { ...open, endsAt: now }, committed: new Set<string>() },
      { shift: open, committed: new Set([accepted.id]) },
    ])
      expect(
        isActionableWorkspaceSchedule({
          schedule: accepted,
          shift: input.shift,
          committedScheduleRunIds: input.committed,
          now,
        }),
      ).toBe(false);
  });
});
