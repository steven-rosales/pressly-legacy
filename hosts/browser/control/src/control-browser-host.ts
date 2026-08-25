import { makeAggregateError, type AppError } from '@pressly/errors/app-error';
import { configError, unexpectedError } from '@pressly/errors/factories';
import { createElement, StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export type ControlBrowserEnvironment = Readonly<{
  document: Pick<Document, 'getElementById'>;
  history: History;
  location: Location;
  storage: Storage;
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}>;

export type ControlBrowserApplication = Readonly<{
  node: ReactNode;
  dispose?: () => void;
}>;

export type ControlBrowserRoot = Pick<Root, 'render' | 'unmount'>;

export type ControlBrowserLifecyclePhase =
  | 'root-lookup'
  | 'root-reservation'
  | 'initialize'
  | 'root-create'
  | 'render'
  | 'teardown';

export type ControlBrowserLifecycleFailure = Readonly<{
  phase: ControlBrowserLifecyclePhase;
  error: AppError;
}>;

export type ControlBrowserHost = Readonly<{
  dispose: () => void;
}>;

export type StartControlBrowserHostInput = Readonly<{
  rootId: string;
  strictMode: boolean;
  environment: ControlBrowserEnvironment;
  initialize: (
    environment: ControlBrowserEnvironment,
  ) => ControlBrowserApplication;
  observeFailure: (failure: ControlBrowserLifecycleFailure) => void;
  createRoot?: (container: Element) => ControlBrowserRoot;
}>;

const mountedRoots = new WeakMap<Element, ControlBrowserHost>();

const observeSafely = (
  observer: StartControlBrowserHostInput['observeFailure'],
  failure: ControlBrowserLifecycleFailure,
): void => {
  try {
    observer(failure);
  } catch {
    return;
  }
};

const throwObserved = (
  observer: StartControlBrowserHostInput['observeFailure'],
  phase: ControlBrowserLifecyclePhase,
  error: AppError,
): never => {
  observeSafely(observer, Object.freeze({ phase, error }));
  throw error;
};

const unexpectedLifecycleError = (
  phase: Exclude<
    ControlBrowserLifecyclePhase,
    'root-lookup' | 'root-reservation'
  >,
  cause: unknown,
): AppError =>
  unexpectedError({
    code: `control_browser_${phase.replace('-', '_')}_failed`,
    message: `Control browser lifecycle failed during ${phase}.`,
    safeMessage: 'The application could not complete its browser lifecycle.',
    cause,
    details: { phase },
  });

const cleanup = (
  root: ControlBrowserRoot | undefined,
  application: ControlBrowserApplication | undefined,
): readonly unknown[] => {
  const failures: unknown[] = [];

  if (root !== undefined) {
    try {
      root.unmount();
    } catch (failure: unknown) {
      failures.push(failure);
    }
  }

  if (application?.dispose !== undefined) {
    try {
      application.dispose();
    } catch (failure: unknown) {
      failures.push(failure);
    }
  }

  return failures;
};

const combinedFailure = (
  primary: unknown,
  cleanupFailures: readonly unknown[],
  message: string,
): unknown =>
  cleanupFailures.length === 0
    ? primary
    : makeAggregateError({
        errors: [primary, ...cleanupFailures],
        message,
        cause: primary,
      });

export const startControlBrowserHost = (
  input: StartControlBrowserHostInput,
): ControlBrowserHost => {
  const container = input.environment.document.getElementById(input.rootId);
  if (container === null)
    return throwObserved(
      input.observeFailure,
      'root-lookup',
      configError({
        code: 'control_browser_root_missing',
        message: `Control browser root element "${input.rootId}" was not found.`,
        safeMessage: 'The application root is unavailable.',
        details: { rootId: input.rootId },
      }),
    );

  if (mountedRoots.has(container))
    return throwObserved(
      input.observeFailure,
      'root-reservation',
      configError({
        code: 'control_browser_root_already_mounted',
        message: `Control browser root element "${input.rootId}" is already mounted.`,
        safeMessage: 'The application is already running.',
        details: { rootId: input.rootId },
      }),
    );

  let application: ControlBrowserApplication | undefined;
  let root: ControlBrowserRoot | undefined;
  let disposed = false;

  const lifecycle: ControlBrowserHost = Object.freeze({
    dispose: () => {
      if (disposed) return;

      disposed = true;
      mountedRoots.delete(container);
      const failures = cleanup(root, application);
      if (failures.length === 0) return;

      const cause =
        failures.length === 1
          ? failures[0]
          : makeAggregateError({
              errors: failures,
              message: 'Control browser teardown failures.',
            });
      return throwObserved(
        input.observeFailure,
        'teardown',
        unexpectedLifecycleError('teardown', cause),
      );
    },
  });

  mountedRoots.set(container, lifecycle);

  const failStartup = (
    phase: 'initialize' | 'root-create' | 'render',
    failure: unknown,
  ): never => {
    disposed = true;
    mountedRoots.delete(container);
    const cause = combinedFailure(
      failure,
      cleanup(root, application),
      `Control browser ${phase} and cleanup failed.`,
    );
    return throwObserved(
      input.observeFailure,
      phase,
      unexpectedLifecycleError(phase, cause),
    );
  };

  try {
    application = input.initialize(input.environment);
  } catch (failure: unknown) {
    return failStartup('initialize', failure);
  }

  try {
    root = (input.createRoot ?? createRoot)(container);
  } catch (failure: unknown) {
    return failStartup('root-create', failure);
  }

  try {
    root.render(
      input.strictMode
        ? createElement(StrictMode, null, application.node)
        : application.node,
    );
  } catch (failure: unknown) {
    return failStartup('render', failure);
  }

  return lifecycle;
};
