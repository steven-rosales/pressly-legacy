import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  defineJobCatalog,
  defineMessageContract,
  defineOperation,
  job,
} from '@pressly/cells';
import { isAppError } from '@pressly/errors/app-error';
import { unexpectedError } from '@pressly/errors/factories';
import { describe, expect, it } from 'vitest';
import {
  registrationsFromJobCatalog,
  runJobsHost,
  type JobHostDependencies,
} from '../src/jobs-host.ts';

type TestInput = Readonly<{ value: string }>;
type TestOutput = Readonly<{ handled: string }>;
type TestFailure = Readonly<{ code: 'not_handled'; value: string }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const inputContract = defineBoundaryContract<TestInput>({
  version: 1,
  decode: (value) =>
    isRecord(value) && typeof value['value'] === 'string'
      ? decode.valid({ value: value['value'] })
      : decode.invalid([{ path: ['value'], message: 'value required' }]),
  encode: (value) => value,
});

const outputContract = defineBoundaryContract<TestOutput>({
  version: 1,
  decode: (value) =>
    isRecord(value) && typeof value['handled'] === 'string'
      ? decode.valid({ handled: value['handled'] })
      : decode.invalid([{ path: ['handled'], message: 'handled required' }]),
  encode: (value) => value,
});

const failureContract = defineBoundaryContract<TestFailure>({
  version: 1,
  decode: (value) =>
    isRecord(value) &&
    value['code'] === 'not_handled' &&
    typeof value['value'] === 'string'
      ? decode.valid({ code: value['code'], value: value['value'] })
      : decode.invalid([{ path: [], message: 'failure required' }]),
  encode: (value) => value,
});

const consumed = defineMessageContract({
  type: 'example.available',
  version: 1,
  payload: inputContract,
});

const makeCell = (
  input: Readonly<{
    execute: (
      value: TestInput,
    ) => Promise<
      | Readonly<{ kind: 'success'; value: TestOutput }>
      | Readonly<{ kind: 'failure'; failure: TestFailure }>
    >;
  }>,
) =>
  defineOperation<TestInput, TestOutput, TestFailure>({
    kind: 'reaction',
    id: 'example.react.v1',
    contract: defineCellContract({
      input: inputContract,
      output: outputContract,
      failure: failureContract,
    }),
    consumes: [consumed],
    surfaces: [
      job.message({
        id: 'example-react-v1',
        queue: 'example-events',
        timeoutMs: 250,
        toSerializedInput: (payload) => payload,
        presentFailure: (failure: TestFailure) => ({
          code: failure.code,
          message: failure.value,
          retryable: false,
        }),
      }),
    ],
    retry: {
      maxAttempts: 5,
      strategy: 'bounded-exponential-jitter',
      deadLetter: 'retain',
    },
    timeoutMs: 500,
    observability: { operation: 'example.react' },
    execute: input.execute,
  });

describe('generic jobs catalog host', () => {
  const signal = new AbortController().signal;

  it('maps declarations and invokes one cell execution', async () => {
    let executions = 0;
    const cell = makeCell({
      execute: async (input) => {
        executions += 1;
        return { kind: 'success', value: { handled: input.value } };
      },
    });

    const [registration] = registrationsFromJobCatalog(
      defineJobCatalog([cell]),
    );

    expect(registration).toMatchObject({
      operationId: 'example.react.v1',
      observability: 'example.react',
      jobId: 'example-react-v1',
      trigger: 'message',
      queue: 'example-events',
      timeoutMs: 250,
      retry: {
        maxAttempts: 5,
        strategy: 'bounded-exponential-jitter',
        deadLetter: 'retain',
      },
    });
    await expect(
      registration?.invoke({ value: 'payload' }, signal),
    ).resolves.toEqual({ kind: 'complete' });
    expect(executions).toBe(1);
  });

  it('preserves typed expected failures as data', async () => {
    const failure: TestFailure = { code: 'not_handled', value: 'blocked' };
    const [registration] = registrationsFromJobCatalog(
      defineJobCatalog([
        makeCell({
          execute: async () => ({ kind: 'failure', failure }),
        }),
      ]),
    );

    const outcome = await registration?.invoke({ value: 'blocked' }, signal);

    expect(outcome).toEqual({
      kind: 'reject',
      failure: {
        code: 'not_handled',
        message: 'blocked',
        retryable: false,
      },
    });
  });

  it('rejects an invalid payload without executing the cell', async () => {
    let executions = 0;
    const [registration] = registrationsFromJobCatalog(
      defineJobCatalog([
        makeCell({
          execute: async () => {
            executions += 1;
            return { kind: 'success', value: { handled: 'unexpected' } };
          },
        }),
      ]),
    );

    const rejection = registration?.invoke({ wrong: true }, signal);

    await expect(rejection).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.code === 'job_cell_input_invalid',
    );
    expect(executions).toBe(0);
  });

  it('delegates execution and orderly shutdown to the injected platform', async () => {
    const events: string[] = [];
    const controller = new AbortController();
    const cell = makeCell({
      execute: async (input) => ({
        kind: 'success',
        value: { handled: input.value },
      }),
    });
    const dependencies: JobHostDependencies = {
      execution: {
        run: async ({ jobs, signal }) => {
          events.push('run');
          expect(signal).toBe(controller.signal);
          expect(jobs).toHaveLength(1);
          await expect(
            jobs[0]?.invoke({ value: 'payload' }, signal),
          ).resolves.toEqual({ kind: 'complete' });
        },
        shutdown: async () => {
          events.push('shutdown');
        },
      },
      startLifecycle: () => ({
        signal: controller.signal,
        dispose: async () => {
          events.push('dispose');
        },
      }),
    };

    await runJobsHost({
      catalog: defineJobCatalog([cell]),
      dependencies,
    });

    expect(events).toEqual(['run', 'shutdown', 'dispose']);
  });

  it('shuts down and disposes after a runtime rejection', async () => {
    const events: string[] = [];
    const runtimeFailure = unexpectedError({
      code: 'test_runtime_failed',
      message: 'The fake runtime failed.',
    });
    const run = runJobsHost({
      catalog: defineJobCatalog([
        makeCell({
          execute: async (input) => ({
            kind: 'success',
            value: { handled: input.value },
          }),
        }),
      ]),
      dependencies: {
        execution: {
          run: async () => {
            events.push('run');
            throw runtimeFailure;
          },
          shutdown: async () => {
            events.push('shutdown');
          },
        },
        startLifecycle: () => ({
          signal: new AbortController().signal,
          dispose: async () => {
            events.push('dispose');
          },
        }),
      },
    });

    await expect(run).rejects.toBe(runtimeFailure);
    expect(events).toEqual(['run', 'shutdown', 'dispose']);
  });

  it('preserves every independent runtime, shutdown, and lifecycle failure', async () => {
    const runtimeFailure = unexpectedError({
      code: 'test_runtime_failed',
      message: 'Runtime failed.',
    });
    const shutdownFailure = unexpectedError({
      code: 'test_shutdown_failed',
      message: 'Shutdown failed.',
    });
    const disposalFailure = unexpectedError({
      code: 'test_lifecycle_disposal_failed',
      message: 'Lifecycle disposal failed.',
    });

    const failure = await runJobsHost({
      catalog: defineJobCatalog([]),
      dependencies: {
        execution: {
          run: async () => Promise.reject(runtimeFailure),
          shutdown: async () => Promise.reject(shutdownFailure),
        },
        startLifecycle: () => ({
          signal: new AbortController().signal,
          dispose: async () => Promise.reject(disposalFailure),
        }),
      },
    }).catch((value: unknown) => value);

    expect(failure).toMatchObject({
      code: 'jobs_host_lifecycle_failed',
      details: { failureCount: 3 },
      cause: expect.any(AggregateError),
    });
    expect((failure as Error & { cause: AggregateError }).cause.errors).toEqual(
      [runtimeFailure, shutdownFailure, disposalFailure],
    );
  });
});
