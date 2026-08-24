import { describe, expect, expectTypeOf, it } from 'vitest';
import * as result from '../src/result.ts';
import * as stateMachine from '../src/state-machine.ts';
import type { StateMachineRejection } from '../src/state-machine.ts';

const states = ['queued', 'running', 'done'] as const;

type Event =
  | Readonly<{ type: 'start'; operatorId: string }>
  | Readonly<{ type: 'finish'; completedPounds: number }>;

type Entity = Readonly<{
  state: string;
  handledPounds: number;
}>;

type Context = Readonly<{
  mayStart: boolean;
}>;

type Effect = Readonly<{
  type: 'stage_started';
  operatorId: string;
}>;

const rejection = (code: string): StateMachineRejection => ({ code });

const makeMachine = () =>
  stateMachine.define<typeof states, Event, Entity, Context, Effect>({
    name: 'stage-run',
    states,
    initial: 'queued',
    terminal: ['done'],
    getState: (entity) => entity.state,
    setState: (entity, next) => ({ ...entity, state: next }),
    transitions: [
      {
        from: 'queued',
        on: 'start',
        to: 'running',
        description: 'Start physical work.',
        guards: [
          {
            name: 'operator-may-start',
            check: (args) => {
              expectTypeOf(args.event).toEqualTypeOf<
                Extract<Event, { type: 'start' }>
              >();

              return args.ctx.mayStart
                ? result.ok(args)
                : result.err(rejection('START_NOT_ALLOWED'));
            },
          },
        ],
        evolve: ({ entity }) => ({
          ...entity,
          state: 'ignored-by-machine',
          handledPounds: entity.handledPounds + 10,
        }),
        deriveEffects: ({ event }) => [
          { type: 'stage_started', operatorId: event.operatorId },
        ],
      },
      {
        from: 'running',
        on: 'finish',
        to: 'done',
        evolve: ({ entity, event }) => ({
          ...entity,
          handledPounds: event.completedPounds,
        }),
      },
    ],
    invariants: [
      {
        name: 'handled-pounds-are-nonnegative',
        check: (args) =>
          args.entity.handledPounds >= 0
            ? result.ok(args)
            : result.err(rejection('NEGATIVE_HANDLED_POUNDS')),
      },
    ],
  });

describe('stateMachine', () => {
  it('transitions immutably, sets state last, and derives effects', () => {
    const machine = makeMachine();
    const entity: Entity = { state: 'queued', handledPounds: 0 };
    const event: Event = { type: 'start', operatorId: 'operator-1' };

    expect(machine.transition(entity, event, { mayStart: true })).toEqual(
      result.ok({
        machine: 'stage-run',
        from: 'queued',
        to: 'running',
        event,
        entity: { state: 'running', handledPounds: 10 },
        effects: [{ type: 'stage_started', operatorId: 'operator-1' }],
      }),
    );
    expect(entity).toEqual({ state: 'queued', handledPounds: 0 });
  });

  it('returns named guard rejections and supports a boolean eligibility check', () => {
    const machine = makeMachine();
    const entity: Entity = { state: 'queued', handledPounds: 0 };
    const event: Event = { type: 'start', operatorId: 'operator-1' };

    expect(machine.transition(entity, event, { mayStart: false })).toEqual(
      result.err({
        kind: 'guard_rejected',
        machine: 'stage-run',
        from: 'queued',
        event,
        guard: 'operator-may-start',
        code: 'START_NOT_ALLOWED',
      }),
    );
    expect(machine.can(entity, event, { mayStart: false })).toBe(false);
    expect(machine.can(entity, event, { mayStart: true })).toBe(true);
  });

  it('distinguishes unknown states, invalid transitions, and invariants', () => {
    const machine = makeMachine();
    const finish: Event = { type: 'finish', completedPounds: 10 };
    const start: Event = { type: 'start', operatorId: 'operator-1' };

    expect(
      machine.transition({ state: 'missing', handledPounds: 0 }, start, {
        mayStart: true,
      }),
    ).toEqual(
      result.err({
        kind: 'unknown_state',
        machine: 'stage-run',
        state: 'missing',
        event: start,
      }),
    );
    expect(
      machine.transition({ state: 'queued', handledPounds: 0 }, finish, {
        mayStart: true,
      }),
    ).toEqual(
      result.err({
        kind: 'invalid_transition',
        machine: 'stage-run',
        from: 'queued',
        event: finish,
        allowedEvents: ['start'],
      }),
    );
    expect(
      machine.transition({ state: 'queued', handledPounds: -1 }, start, {
        mayStart: true,
      }),
    ).toEqual(
      result.err({
        kind: 'invariant_failed',
        machine: 'stage-run',
        from: 'queued',
        state: 'queued',
        event: start,
        invariant: 'handled-pounds-are-nonnegative',
        phase: 'before',
        code: 'NEGATIVE_HANDLED_POUNDS',
      }),
    );
    expect(
      machine.transition(
        { state: 'running', handledPounds: 0 },
        { type: 'finish', completedPounds: -1 },
        { mayStart: true },
      ),
    ).toEqual(
      result.err({
        kind: 'invariant_failed',
        machine: 'stage-run',
        from: 'running',
        state: 'done',
        event: { type: 'finish', completedPounds: -1 },
        invariant: 'handled-pounds-are-nonnegative',
        phase: 'after',
        code: 'NEGATIVE_HANDLED_POUNDS',
      }),
    );
  });

  it('exposes immutable declarative metadata', () => {
    const machine = makeMachine();

    expect(machine.states).toEqual(['queued', 'running', 'done']);
    expect(machine.terminal).toEqual(['done']);
    expect(machine.allowedEvents('queued')).toEqual(['start']);
    expect(machine.allowedEvents('done')).toEqual([]);
    expect(machine.isTerminal('done')).toBe(true);
    expect(machine.graph).toEqual([
      {
        from: 'queued',
        event: 'start',
        to: 'running',
        description: 'Start physical work.',
      },
      { from: 'running', event: 'finish', to: 'done' },
    ]);
    expect(Object.isFrozen(machine.graph)).toBe(true);
  });

  it('rejects ambiguous or contradictory definitions at construction', () => {
    expect(() =>
      stateMachine.define<
        readonly ['queued', 'done', 'queued'],
        Event,
        Entity,
        Context
      >({
        name: 'invalid',
        states: ['queued', 'done', 'queued'],
        initial: 'queued',
        terminal: ['done', 'done'],
        getState: (entity) => entity.state,
        setState: (entity, next) => ({ ...entity, state: next }),
        transitions: [
          { from: 'done', on: 'start', to: 'queued' },
          { from: 'queued', on: 'finish', to: 'done' },
          { from: 'queued', on: 'finish', to: 'done' },
        ],
      }),
    ).toThrowError(
      [
        'Invalid state machine "invalid":',
        '- Duplicate state "queued".',
        '- Duplicate terminal state "done".',
        '- Terminal state "done" cannot have transitions.',
        '- Duplicate transition from "queued" on "finish".',
      ].join('\n'),
    );
  });

  it('treats a broken state writer as a programming error', () => {
    const machine = stateMachine.define<
      readonly ['queued', 'running'],
      Extract<Event, { type: 'start' }>,
      Entity,
      Context
    >({
      name: 'broken-writer',
      states: ['queued', 'running'],
      initial: 'queued',
      getState: (entity) => entity.state,
      setState: (entity) => entity,
      transitions: [{ from: 'queued', on: 'start', to: 'running' }],
    });

    expect(() =>
      machine.transition(
        { state: 'queued', handledPounds: 0 },
        { type: 'start', operatorId: 'operator-1' },
        { mayStart: true },
      ),
    ).toThrowError(
      'State machine "broken-writer" setState returned state "queued" while transitioning from "queued" to "running".',
    );
  });
});
