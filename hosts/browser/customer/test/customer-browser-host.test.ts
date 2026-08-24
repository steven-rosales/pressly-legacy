import { isAppError } from '@pressly/errors/app-error';
import { configError } from '@pressly/errors/factories';
import { describe, expect, it } from 'vitest';
import {
  startCustomerBrowserHost,
  type CustomerBrowserHostFailure,
  type CustomerBrowserLifecycle,
} from '../src/customer-browser-host.ts';

const captureThrown = (operation: () => void): unknown => {
  try {
    operation();
  } catch (error: unknown) {
    return error;
  }

  return undefined;
};

describe('customer browser host', () => {
  it('starts one runtime for one active lifecycle identity', () => {
    let starts = 0;
    const lifecycle: CustomerBrowserLifecycle = {
      startRuntime: () => {
        starts += 1;
        return undefined;
      },
      observeFailure: () => undefined,
    };

    const first = startCustomerBrowserHost(lifecycle);
    const second = startCustomerBrowserHost(lifecycle);

    expect(second).toBe(first);
    expect(starts).toBe(1);
    first.teardown();
  });

  it('keys active runtimes by lifecycle object identity', () => {
    let starts = 0;
    const makeLifecycle = (): CustomerBrowserLifecycle => ({
      startRuntime: () => {
        starts += 1;
        return undefined;
      },
      observeFailure: () => undefined,
    });
    const first = startCustomerBrowserHost(makeLifecycle());
    const second = startCustomerBrowserHost(makeLifecycle());

    expect(starts).toBe(2);
    first.teardown();
    second.teardown();
  });

  it('tears down once and permits a later restart', () => {
    let starts = 0;
    let teardowns = 0;
    const lifecycle: CustomerBrowserLifecycle = {
      startRuntime: () => {
        starts += 1;
        return () => {
          teardowns += 1;
        };
      },
      observeFailure: () => undefined,
    };

    const first = startCustomerBrowserHost(lifecycle);
    first.teardown();
    first.teardown();
    const second = startCustomerBrowserHost(lifecycle);
    second.teardown();

    expect(starts).toBe(2);
    expect(teardowns).toBe(2);
  });

  it('observes and rethrows a normalized startup failure', () => {
    const cause = Object.freeze({ fixture: 'instrumentation unavailable' });
    const failures: CustomerBrowserHostFailure[] = [];
    const lifecycle: CustomerBrowserLifecycle = {
      startRuntime: () => {
        throw cause;
      },
      observeFailure: (failure) => failures.push(failure),
    };

    const thrown = captureThrown(() => startCustomerBrowserHost(lifecycle));

    expect(isAppError(thrown)).toBe(true);
    expect(thrown).toMatchObject({
      code: 'unknown_thrown_value',
      cause,
    });
    expect(failures).toEqual([{ phase: 'startup', error: thrown }]);
  });

  it('preserves an AppError raised during startup', () => {
    const expected = configError({
      code: 'customer_browser_configuration_invalid',
      message: 'Instrumentation configuration is invalid.',
    });
    const failures: CustomerBrowserHostFailure[] = [];
    const lifecycle: CustomerBrowserLifecycle = {
      startRuntime: () => {
        throw expected;
      },
      observeFailure: (failure) => failures.push(failure),
    };

    const thrown = captureThrown(() => startCustomerBrowserHost(lifecycle));

    expect(thrown).toBe(expected);
    expect(failures).toEqual([{ phase: 'startup', error: expected }]);
  });

  it('rejects asynchronous runtime startup without retaining the identity', () => {
    let starts = 0;
    const failures: CustomerBrowserHostFailure[] = [];
    const lifecycle: CustomerBrowserLifecycle = {
      startRuntime: (() => {
        starts += 1;
        return Promise.resolve();
      }) as unknown as CustomerBrowserLifecycle['startRuntime'],
      observeFailure: (failure) => failures.push(failure),
    };

    const first = captureThrown(() => startCustomerBrowserHost(lifecycle));
    const second = captureThrown(() => startCustomerBrowserHost(lifecycle));

    expect(first).toMatchObject({
      tag: 'AppError',
      kind: 'ConfigError',
      code: 'customer_browser_runtime_teardown_invalid',
    });
    expect(second).toMatchObject({
      code: 'customer_browser_runtime_teardown_invalid',
    });
    expect(starts).toBe(2);
    expect(failures.map(({ phase }) => phase)).toEqual(['startup', 'startup']);
  });

  it('observes and rethrows teardown failure only once', () => {
    const cause = Object.freeze({ fixture: 'instrumentation teardown failed' });
    const failures: CustomerBrowserHostFailure[] = [];
    let teardowns = 0;
    const lifecycle: CustomerBrowserLifecycle = {
      startRuntime: () => () => {
        teardowns += 1;
        throw cause;
      },
      observeFailure: (failure) => failures.push(failure),
    };
    const session = startCustomerBrowserHost(lifecycle);

    const first = captureThrown(session.teardown);
    const second = captureThrown(session.teardown);

    expect(isAppError(first)).toBe(true);
    expect(first).toMatchObject({ code: 'unknown_thrown_value', cause });
    expect(second).toBeUndefined();
    expect(teardowns).toBe(1);
    expect(failures).toEqual([{ phase: 'teardown', error: first }]);

    const restarted = startCustomerBrowserHost(lifecycle);
    expect(captureThrown(restarted.teardown)).toMatchObject({
      code: 'unknown_thrown_value',
    });
  });

  it('does not let a failing observer replace the normalized lifecycle error', () => {
    const runtimeFailure = configError({
      code: 'customer_browser_runtime_failed',
      message: 'Customer browser runtime failed.',
    });
    const observerFailure = configError({
      code: 'customer_browser_observer_failed',
      message: 'Customer browser observer failed.',
    });
    const lifecycle: CustomerBrowserLifecycle = {
      startRuntime: () => {
        throw runtimeFailure;
      },
      observeFailure: () => {
        throw observerFailure;
      },
    };

    const thrown = captureThrown(() => startCustomerBrowserHost(lifecycle));

    expect(thrown).toMatchObject({
      tag: 'AppError',
      code: 'customer_browser_runtime_failed',
    });
    expect(thrown).toBe(runtimeFailure);
  });
});
