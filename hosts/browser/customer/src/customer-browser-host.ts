import {
  normalizeUnknownError,
  type AppError,
} from '@pressly/errors/app-error';
import { configError } from '@pressly/errors/factories';

export type CustomerBrowserHostFailurePhase = 'startup' | 'teardown';

export type CustomerBrowserHostFailure = Readonly<{
  phase: CustomerBrowserHostFailurePhase;
  error: AppError;
}>;

export type CustomerBrowserRuntimeTeardown = () => void;

/**
 * Next owns document rendering, hydration, routing, and StrictMode. This
 * injected lifecycle owns only client-runtime instrumentation and providers.
 * Its object identity is the key for one active browser-host session.
 */
export type CustomerBrowserLifecycle = Readonly<{
  startRuntime: () => CustomerBrowserRuntimeTeardown | undefined;
  observeFailure: (failure: CustomerBrowserHostFailure) => void;
}>;

export type CustomerBrowserHostSession = Readonly<{
  teardown: () => void;
}>;

type StartingLifecycle = Readonly<{ state: 'starting' }>;
type ActiveLifecycle = Readonly<{
  state: 'active';
  session: CustomerBrowserHostSession;
}>;
type LifecycleEntry = StartingLifecycle | ActiveLifecycle;

const lifecycles = new WeakMap<CustomerBrowserLifecycle, LifecycleEntry>();

const reportFailure = (
  lifecycle: CustomerBrowserLifecycle,
  phase: CustomerBrowserHostFailurePhase,
  cause: unknown,
): AppError => {
  const error = normalizeUnknownError(cause);

  try {
    lifecycle.observeFailure(Object.freeze({ phase, error }));
  } catch {
    // A broken observer must not replace the normalized lifecycle failure.
  }

  return error;
};

const invalidRuntimeTeardown = () =>
  configError({
    code: 'customer_browser_runtime_teardown_invalid',
    message:
      'Customer browser runtime startup must return a synchronous teardown function or undefined.',
    safeMessage: 'The customer browser could not start.',
  });

const reenteredStartup = () =>
  configError({
    code: 'customer_browser_runtime_start_reentered',
    message:
      'Customer browser runtime startup re-entered for the same lifecycle identity.',
    safeMessage: 'The customer browser could not start.',
  });

/**
 * Starts the framework-owned Next client runtime. It never creates or hydrates
 * a React root; Next remains the sole rendering lifecycle.
 */
export const startCustomerBrowserHost = (
  lifecycle: CustomerBrowserLifecycle,
): CustomerBrowserHostSession => {
  const existing = lifecycles.get(lifecycle);
  if (existing?.state === 'active') return existing.session;
  if (existing?.state === 'starting')
    throw reportFailure(lifecycle, 'startup', reenteredStartup());

  lifecycles.set(lifecycle, Object.freeze({ state: 'starting' }));

  try {
    const runtimeTeardown = lifecycle.startRuntime();
    if (runtimeTeardown !== undefined && typeof runtimeTeardown !== 'function')
      throw invalidRuntimeTeardown();

    let tornDown = false;
    const session: CustomerBrowserHostSession = Object.freeze({
      teardown: () => {
        if (tornDown) return;
        tornDown = true;
        lifecycles.delete(lifecycle);

        if (runtimeTeardown === undefined) return;

        try {
          runtimeTeardown();
        } catch (cause: unknown) {
          throw reportFailure(lifecycle, 'teardown', cause);
        }
      },
    });

    lifecycles.set(lifecycle, Object.freeze({ state: 'active', session }));
    return session;
  } catch (cause: unknown) {
    lifecycles.delete(lifecycle);
    throw reportFailure(lifecycle, 'startup', cause);
  }
};
