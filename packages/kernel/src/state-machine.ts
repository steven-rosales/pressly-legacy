import { invariantViolationError } from '@pressly/errors/factories';
import { err, isErr, isOk, ok, type Result } from './result.ts';
import type { Spec } from './spec.ts';

export type StateMachineEvent = Readonly<{
  type: string;
}>;

export type StateMachineRejection = Readonly<{
  code: string;
  message?: string;
}>;

export type StateMachineInvariantPhase = 'before' | 'after';

export type StateMachineGuardArgs<
  State extends string,
  Event extends StateMachineEvent,
  Entity,
  Context,
> = Readonly<{
  machine: string;
  entity: Entity;
  from: State;
  event: Event;
  ctx: Context;
}>;

export type StateMachineInvariantArgs<
  State extends string,
  Entity,
  Context,
> = Readonly<{
  machine: string;
  entity: Entity;
  state: State;
  ctx: Context;
}>;

export type StateMachineGuard<
  State extends string,
  Event extends StateMachineEvent,
  Entity,
  Context,
> = Spec<
  StateMachineGuardArgs<State, Event, Entity, Context>,
  StateMachineRejection
>;

export type StateMachineInvariant<State extends string, Entity, Context> = Spec<
  StateMachineInvariantArgs<State, Entity, Context>,
  StateMachineRejection
>;

export type StateMachineTransitionArgs<
  State extends string,
  Event extends StateMachineEvent,
  Entity,
  Context,
> = Readonly<{
  entity: Entity;
  from: State;
  to: State;
  event: Event;
  ctx: Context;
}>;

export type StateMachineEffectArgs<
  State extends string,
  Event extends StateMachineEvent,
  Entity,
  Context,
> = Readonly<{
  entity: Entity;
  nextEntity: Entity;
  from: State;
  to: State;
  event: Event;
  ctx: Context;
}>;

type OneOrMany<T> = T | readonly T[];

type EventOfType<
  Event extends StateMachineEvent,
  Type extends Event['type'],
> = Extract<Event, { readonly type: Type }>;

export type StateMachineTransitionDefinition<
  State extends string,
  Event extends StateMachineEvent,
  Entity,
  Context,
  Effect extends StateMachineEvent,
> = {
  [Type in Event['type']]: Readonly<{
    from: OneOrMany<State>;
    on: Type;
    to: State;
    guards?: readonly StateMachineGuard<
      State,
      EventOfType<Event, Type>,
      Entity,
      Context
    >[];
    evolve?: (
      args: StateMachineTransitionArgs<
        State,
        EventOfType<Event, Type>,
        Entity,
        Context
      >,
    ) => Entity;
    deriveEffects?: (
      args: StateMachineEffectArgs<
        State,
        EventOfType<Event, Type>,
        Entity,
        Context
      >,
    ) => readonly Effect[];
    description?: string;
  }>;
}[Event['type']];

export type StateMachineDefinition<
  States extends readonly [string, ...string[]],
  Event extends StateMachineEvent,
  Entity,
  Context,
  Effect extends StateMachineEvent,
> = Readonly<{
  name: string;
  states: States;
  initial: States[number];
  terminal?: readonly States[number][];
  getState: (entity: Entity) => string;
  setState: (entity: Entity, next: States[number]) => Entity;
  transitions: readonly StateMachineTransitionDefinition<
    States[number],
    Event,
    Entity,
    Context,
    Effect
  >[];
  invariants?: readonly StateMachineInvariant<
    States[number],
    Entity,
    Context
  >[];
}>;

export type StateMachineGraphEdge<
  State extends string,
  EventType extends string,
> = Readonly<{
  from: State;
  event: EventType;
  to: State;
  description?: string;
}>;

export type StateMachineTransitionOutcome<
  State extends string,
  Event extends StateMachineEvent,
  Entity,
  Effect extends StateMachineEvent,
> = Readonly<{
  machine: string;
  from: State;
  to: State;
  event: Event;
  entity: Entity;
  effects: readonly Effect[];
}>;

export type StateMachineError<
  State extends string,
  Event extends StateMachineEvent,
> =
  | Readonly<{
      kind: 'unknown_state';
      machine: string;
      state: string;
      event: Event;
    }>
  | Readonly<{
      kind: 'invalid_transition';
      machine: string;
      from: State;
      event: Event;
      allowedEvents: readonly Event['type'][];
    }>
  | Readonly<{
      kind: 'guard_rejected';
      machine: string;
      from: State;
      event: Event;
      guard: string;
      code: string;
      message?: string;
    }>
  | Readonly<{
      kind: 'invariant_failed';
      machine: string;
      from: State;
      state: State;
      event: Event;
      invariant: string;
      phase: StateMachineInvariantPhase;
      code: string;
      message?: string;
    }>;

export type StateMachineTransitionResult<
  State extends string,
  Event extends StateMachineEvent,
  Entity,
  Effect extends StateMachineEvent,
> = Result<
  StateMachineTransitionOutcome<State, Event, Entity, Effect>,
  StateMachineError<State, Event>
>;

export type StateMachine<
  States extends readonly [string, ...string[]],
  Event extends StateMachineEvent,
  Entity,
  Context,
  Effect extends StateMachineEvent,
> = Readonly<{
  name: string;
  states: States;
  initial: States[number];
  terminal: readonly States[number][];
  graph: readonly StateMachineGraphEdge<States[number], Event['type']>[];
  transition: (
    entity: Entity,
    event: Event,
    ctx: Context,
  ) => StateMachineTransitionResult<States[number], Event, Entity, Effect>;
  can: (entity: Entity, event: Event, ctx: Context) => boolean;
  allowedEvents: (state: States[number]) => readonly Event['type'][];
  isTerminal: (state: States[number]) => boolean;
}>;

type RuntimeTransition<
  State extends string,
  Event extends StateMachineEvent,
  Entity,
  Context,
  Effect extends StateMachineEvent,
> = Readonly<{
  from: readonly State[];
  on: Event['type'];
  to: State;
  guards: readonly StateMachineGuard<State, Event, Entity, Context>[];
  evolve?: (
    args: StateMachineTransitionArgs<State, Event, Entity, Context>,
  ) => Entity;
  deriveEffects?: (
    args: StateMachineEffectArgs<State, Event, Entity, Context>,
  ) => readonly Effect[];
  description?: string;
}>;

const normalize = <T>(value: OneOrMany<T>): readonly T[] =>
  Array.isArray(value) ? value : [value as T];

const optionalMessage = (
  rejection: StateMachineRejection,
): Readonly<{ message?: string }> =>
  rejection.message === undefined ? {} : { message: rejection.message };

const validateDefinition = <
  States extends readonly [string, ...string[]],
  Event extends StateMachineEvent,
  Entity,
  Context,
  Effect extends StateMachineEvent,
>(
  definition: StateMachineDefinition<States, Event, Entity, Context, Effect>,
): readonly string[] => {
  const errors: string[] = [];
  const stateSet = new Set<string>();

  if (definition.name.trim().length === 0)
    errors.push('Machine name cannot be empty.');

  for (const state of definition.states) {
    if (state.trim().length === 0) errors.push('State names cannot be empty.');

    if (stateSet.has(state)) errors.push(`Duplicate state "${state}".`);

    stateSet.add(state);
  }

  if (!stateSet.has(definition.initial))
    errors.push(`Initial state "${definition.initial}" is not declared.`);

  const terminalSet = new Set<string>();

  for (const terminal of definition.terminal ?? []) {
    if (!stateSet.has(terminal))
      errors.push(`Terminal state "${terminal}" is not declared.`);

    if (terminalSet.has(terminal))
      errors.push(`Duplicate terminal state "${terminal}".`);

    terminalSet.add(terminal);
  }

  const seenTransitions = new Map<string, Set<string>>();

  for (const transition of definition.transitions) {
    const fromStates = normalize(transition.from);

    if (fromStates.length === 0)
      errors.push(`Transition on "${transition.on}" has no from-state.`);

    if (transition.on.trim().length === 0)
      errors.push('Transition event names cannot be empty.');

    if (!stateSet.has(transition.to))
      errors.push(`Transition target "${transition.to}" is not declared.`);

    const guardNames = new Set<string>();

    for (const guard of transition.guards ?? []) {
      if (guard.name.trim().length === 0)
        errors.push(`Guard on "${transition.on}" must have a name.`);

      if (guardNames.has(guard.name))
        errors.push(
          `Duplicate guard "${guard.name}" on transition "${transition.on}".`,
        );

      guardNames.add(guard.name);
    }

    for (const from of fromStates) {
      if (!stateSet.has(from))
        errors.push(`Transition source "${from}" is not declared.`);

      if (terminalSet.has(from))
        errors.push(`Terminal state "${from}" cannot have transitions.`);

      const events = seenTransitions.get(from) ?? new Set<string>();

      if (events.has(transition.on))
        errors.push(
          `Duplicate transition from "${from}" on "${transition.on}".`,
        );

      events.add(transition.on);
      seenTransitions.set(from, events);
    }
  }

  const invariantNames = new Set<string>();

  for (const invariant of definition.invariants ?? []) {
    if (invariant.name.trim().length === 0)
      errors.push('Invariants must have a name.');

    if (invariantNames.has(invariant.name))
      errors.push(`Duplicate invariant "${invariant.name}".`);

    invariantNames.add(invariant.name);
  }

  return errors;
};

const assertValidDefinition = <
  States extends readonly [string, ...string[]],
  Event extends StateMachineEvent,
  Entity,
  Context,
  Effect extends StateMachineEvent,
>(
  definition: StateMachineDefinition<States, Event, Entity, Context, Effect>,
): void => {
  const errors = validateDefinition(definition);

  if (errors.length === 0) return;

  throw invariantViolationError({
    code: 'invalid_state_machine_definition',
    message: `Invalid state machine "${definition.name}":\n${errors
      .map((error) => `- ${error}`)
      .join('\n')}`,
    details: { machine: definition.name, errors },
  });
};

const compileTransition = <
  State extends string,
  Event extends StateMachineEvent,
  Entity,
  Context,
  Effect extends StateMachineEvent,
>(
  transition: StateMachineTransitionDefinition<
    State,
    Event,
    Entity,
    Context,
    Effect
  >,
): RuntimeTransition<State, Event, Entity, Context, Effect> => {
  // The public mapped union narrows callbacks from `on`. The runtime index only
  // dispatches an event to the matching `on`, so erasing that narrowing here is
  // safe and keeps the cast inside the interpreter.
  const narrowed = transition as unknown as RuntimeTransition<
    State,
    Event,
    Entity,
    Context,
    Effect
  >;

  return Object.freeze({
    from: Object.freeze([...normalize(narrowed.from)]),
    on: narrowed.on,
    to: narrowed.to,
    guards: Object.freeze(
      (narrowed.guards ?? []).map((guard) =>
        Object.freeze({ name: guard.name, check: guard.check }),
      ),
    ),
    ...(narrowed.evolve === undefined ? {} : { evolve: narrowed.evolve }),
    ...(narrowed.deriveEffects === undefined
      ? {}
      : { deriveEffects: narrowed.deriveEffects }),
    ...(narrowed.description === undefined
      ? {}
      : { description: narrowed.description }),
  });
};

/**
 * Compiles a deterministic, synchronous state-machine definition. Callbacks
 * must stay pure; loading, persistence, concurrency, and effect execution live
 * outside the machine.
 */
export const define = <
  const States extends readonly [string, ...string[]],
  Event extends StateMachineEvent,
  Entity,
  Context,
  Effect extends StateMachineEvent = never,
>(
  definition: StateMachineDefinition<States, Event, Entity, Context, Effect>,
): StateMachine<States, Event, Entity, Context, Effect> => {
  type State = States[number];

  assertValidDefinition(definition);

  const name = definition.name;
  const getState = definition.getState;
  const setState = definition.setState;
  const states = Object.freeze([...definition.states]) as unknown as States;
  const terminal = Object.freeze([
    ...(definition.terminal ?? []),
  ]) as readonly State[];
  const stateSet = new Set<State>(states);
  const terminalSet = new Set<State>(terminal);
  const transitions = definition.transitions.map((transition) =>
    compileTransition<State, Event, Entity, Context, Effect>(transition),
  );
  const invariants = Object.freeze(
    (definition.invariants ?? []).map((invariant) =>
      Object.freeze({ name: invariant.name, check: invariant.check }),
    ),
  );
  const transitionIndex = new Map<
    State,
    Map<Event['type'], RuntimeTransition<State, Event, Entity, Context, Effect>>
  >();

  for (const state of states) {
    transitionIndex.set(state, new Map());
  }

  for (const transition of transitions) {
    for (const from of transition.from)
      transitionIndex.get(from)?.set(transition.on, transition);
  }

  const eventIndex = new Map<State, readonly Event['type'][]>();

  for (const state of states) {
    eventIndex.set(
      state,
      Object.freeze([...(transitionIndex.get(state)?.keys() ?? [])]),
    );
  }

  const graph = Object.freeze(
    transitions.flatMap((transition) =>
      transition.from.map((from) =>
        Object.freeze({
          from,
          event: transition.on,
          to: transition.to,
          ...(transition.description === undefined
            ? {}
            : { description: transition.description }),
        }),
      ),
    ),
  );

  const isState = (state: string): state is State =>
    stateSet.has(state as State);

  const allowedEvents = (state: State): readonly Event['type'][] =>
    eventIndex.get(state) ?? [];

  const isTerminal = (state: State): boolean => terminalSet.has(state);

  const runInvariants = (args: {
    entity: Entity;
    from: State;
    state: State;
    event: Event;
    ctx: Context;
    phase: StateMachineInvariantPhase;
  }): StateMachineError<State, Event> | undefined => {
    for (const invariant of invariants) {
      const checked = invariant.check({
        machine: name,
        entity: args.entity,
        state: args.state,
        ctx: args.ctx,
      });

      if (isErr(checked))
        return {
          kind: 'invariant_failed',
          machine: name,
          from: args.from,
          state: args.state,
          event: args.event,
          invariant: invariant.name,
          phase: args.phase,
          code: checked.error.code,
          ...optionalMessage(checked.error),
        };
    }

    return undefined;
  };

  const evaluate = (
    entity: Entity,
    event: Event,
    ctx: Context,
    includeEffects: boolean,
  ): StateMachineTransitionResult<State, Event, Entity, Effect> => {
    const currentState = getState(entity);

    if (!isState(currentState))
      return err({
        kind: 'unknown_state',
        machine: name,
        state: currentState,
        event,
      });

    const from = currentState;
    const transition = transitionIndex.get(from)?.get(event.type);

    if (transition === undefined)
      return err({
        kind: 'invalid_transition',
        machine: name,
        from,
        event,
        allowedEvents: allowedEvents(from),
      });

    const beforeInvariantError = runInvariants({
      entity,
      from,
      state: from,
      event,
      ctx,
      phase: 'before',
    });

    if (beforeInvariantError !== undefined) return err(beforeInvariantError);

    for (const guard of transition.guards) {
      const checked = guard.check({
        machine: name,
        entity,
        from,
        event,
        ctx,
      });

      if (isErr(checked))
        return err({
          kind: 'guard_rejected',
          machine: name,
          from,
          event,
          guard: guard.name,
          code: checked.error.code,
          ...optionalMessage(checked.error),
        });
    }

    const transitionArgs = {
      entity,
      from,
      to: transition.to,
      event,
      ctx,
    } satisfies StateMachineTransitionArgs<State, Event, Entity, Context>;
    const evolvedEntity = transition.evolve?.(transitionArgs) ?? entity;
    const nextEntity = setState(evolvedEntity, transition.to);
    const observedState = getState(nextEntity);

    if (observedState !== transition.to)
      throw invariantViolationError({
        code: 'state_machine_set_state_mismatch',
        message: `State machine "${name}" setState returned state "${observedState}" while transitioning from "${from}" to "${transition.to}".`,
        details: {
          machine: name,
          from,
          expectedState: transition.to,
          observedState,
        },
      });

    const afterInvariantError = runInvariants({
      entity: nextEntity,
      from,
      state: transition.to,
      event,
      ctx,
      phase: 'after',
    });

    if (afterInvariantError !== undefined) return err(afterInvariantError);

    const effects: readonly Effect[] =
      includeEffects && transition.deriveEffects !== undefined
        ? Object.freeze([
            ...transition.deriveEffects({
              entity,
              nextEntity,
              from,
              to: transition.to,
              event,
              ctx,
            }),
          ])
        : [];

    return ok({
      machine: name,
      from,
      to: transition.to,
      event,
      entity: nextEntity,
      effects,
    });
  };

  const transition = (
    entity: Entity,
    event: Event,
    ctx: Context,
  ): StateMachineTransitionResult<State, Event, Entity, Effect> =>
    evaluate(entity, event, ctx, true);

  const can = (entity: Entity, event: Event, ctx: Context): boolean =>
    isOk(evaluate(entity, event, ctx, false));

  return Object.freeze({
    name,
    states,
    initial: definition.initial,
    terminal,
    graph,
    transition,
    can,
    allowedEvents,
    isTerminal,
  });
};
