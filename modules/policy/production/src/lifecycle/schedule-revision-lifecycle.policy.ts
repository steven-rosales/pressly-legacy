import { result, stateMachine, type Result } from '@pressly/kernel';

export type ScheduleRevisionLifecycleState =
  | 'draft'
  | 'accepted'
  | 'superseded'
  | 'rejected';
export type ScheduleRevisionLifecycleEvent = 'accept' | 'supersede' | 'reject';

export type ScheduleRevisionLifecycleDecision = Readonly<{
  from: ScheduleRevisionLifecycleState;
  state: ScheduleRevisionLifecycleState;
}>;

export type ScheduleRevisionLifecycleRejection = Readonly<{
  code: 'SCHEDULE_STATE_INVALID' | 'SCHEDULE_EVENT_NOT_ALLOWED';
  message: string;
}>;

type ScheduleEntity = Readonly<{ state: string }>;
type ScheduleEvent = Readonly<{ type: ScheduleRevisionLifecycleEvent }>;

const scheduleStates = ['draft', 'accepted', 'superseded', 'rejected'] as const;
const scheduleInitialState = 'draft' as const;

const scheduleMachine = stateMachine.define<
  typeof scheduleStates,
  ScheduleEvent,
  ScheduleEntity,
  undefined
>({
  name: 'schedule-revision',
  states: scheduleStates,
  initial: scheduleInitialState,
  terminal: ['superseded', 'rejected'],
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    {
      from: 'draft',
      on: 'accept',
      to: 'accepted',
      description: 'Accept a current, actionable schedule revision.',
    },
    {
      from: ['draft', 'accepted'],
      on: 'supersede',
      to: 'superseded',
      description: 'Retire a current revision when its planning truth changes.',
    },
    {
      from: 'draft',
      on: 'reject',
      to: 'rejected',
      description: 'Reject a draft revision without making it actionable.',
    },
  ],
});

const isScheduleState = (
  state: string,
): state is ScheduleRevisionLifecycleState =>
  (scheduleStates as readonly string[]).includes(state);

export const initialScheduleRevisionState = scheduleInitialState;

export const evaluateScheduleRevisionTransition = (input: {
  state: string;
  event: ScheduleRevisionLifecycleEvent;
}): Result<
  ScheduleRevisionLifecycleDecision,
  ScheduleRevisionLifecycleRejection
> => {
  const transition = scheduleMachine.transition(
    { state: input.state },
    { type: input.event },
    undefined,
  );

  if (transition.tag === 'err')
    return result.err(
      transition.error.kind === 'unknown_state'
        ? {
            code: 'SCHEDULE_STATE_INVALID',
            message: 'The schedule revision state is invalid.',
          }
        : {
            code: 'SCHEDULE_EVENT_NOT_ALLOWED',
            message: 'The schedule revision event is not allowed.',
          },
    );

  return result.ok({
    from: transition.value.from,
    state: transition.value.to,
  });
};

export const allowedScheduleRevisionEvents = (
  state: string,
): readonly ScheduleRevisionLifecycleEvent[] =>
  isScheduleState(state) ? scheduleMachine.allowedEvents(state) : [];

export const scheduleRevisionGraph = scheduleMachine.graph;
