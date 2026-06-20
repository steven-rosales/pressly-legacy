import { isErr, type Result } from './result.ts';

export type Step<Env, A, B, E> = Readonly<{
  name: string;
  run: (env: Env, input: A) => Promise<Result<B, E>>;
}>;

export type WorkflowEvent<A, B, E> =
  | Readonly<{
      tag: 'started';
      step: string;
      input: A;
    }>
  | Readonly<{ tag: 'finished'; step: string; input: A; result: Result<B, E> }>;

export const step = <Env, A, B, E>(
  name: string,
  run: (env: Env, input: A) => Promise<Result<B, E>>,
): Step<Env, A, B, E> => ({
  name,
  run,
});

export const chain =
  <Env, B, C, E2>(next: Step<Env, B, C, E2>) =>
  <A, E1>(current: Step<Env, A, B, E1>): Step<Env, A, C, E1 | E2> =>
    step(`${current.name} -> ${next.name}`, async (env, input) => {
      const first = await current.run(env, input);

      if (isErr(first)) return first;

      return next.run(env, first.value) as Promise<Result<C, E1 | E2>>;
    });

export const around =
  <Env, A, B, E>(observe: (event: WorkflowEvent<A, B, E>) => void) =>
  (current: Step<Env, A, B, E>): Step<Env, A, B, E> =>
    step(current.name, async (env, input) => {
      observe({ tag: 'started', step: current.name, input });

      const result = await current.run(env, input);

      observe({ tag: 'finished', step: current.name, input, result });

      return result;
    });
