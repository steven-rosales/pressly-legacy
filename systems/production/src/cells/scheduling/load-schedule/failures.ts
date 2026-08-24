import type { LoadScheduleExpectedFailure } from './types.ts';

export const loadScheduleNotFound = (): LoadScheduleExpectedFailure => ({
  tag: 'ProductionFailure',
  kind: 'not_found',
  code: 'schedule_not_found',
  message: 'The schedule proposal was not found.',
  safeMessage: 'The schedule proposal was not found.',
});
