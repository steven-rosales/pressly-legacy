import { makeAggregateError, type AppError } from '@pressly/errors/app-error';
import { configError, unexpectedError } from '@pressly/errors/factories';
import { createElement, StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export type ProcessorBrowserEnvironment = Readonly<{
  document: Pick<Document, 'getElementById'>;
  history: History;
  location: Location;
  storage: Storage;
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}>;

export type ProcessorBrowserApplication = Readonly<{
  node: ReactNode;
  dispose?: () => void;
}>;

export type ProcessorBrowserRoot = Pick<Root, 'render' | 'unmount'>;

export type ProcessorBrowserLifecyclePhase =
  | 'root-lookup'
  | 'root-reservation'
  | 'initialize'
  | 'root-create'
  | 'render'
  | 'teardown';

export type ProcessorBrowserLifecycleFailure = Readonly<{
  phase: ProcessorBrowserLifecyclePhase;
  error: AppError;
}>;

export type ProcessorBrowserHost = Readonly<{
  dispose: () => void;
}>;

export type StartProcessorBrowserHostInput = Readonly<{
  rootId: string;
  strictMode: boolean;
  environment: ProcessorBrowserEnvironment;
  initialize: (
    environment: ProcessorBrowserEnvironment,
  ) => ProcessorBrowserApplication;
  observeFailure: (failure: ProcessorBrowserLifecycleFailure) => void;
  createRoot?: (container: Element) => ProcessorBrowserRoot;
}>;

const mountedRoots = new WeakMap<Element, ProcessorBrowserHost>();

const observeSafely = (
  observer: StartProcessorBrowserHostInput['observeFailure'],
  failure: ProcessorBrowserLifecycleFailure,
): void => {
  try {
    observer(failure);
  } catch {
    return;
  }
};

const throwObserved = (
  observer: StartProcessorBrowserHostInput['observeFailure'],
  phase: ProcessorBrowserLifecyclePhase,
  error: AppError,
): never => {
  observeSafely(observer, Object.freeze({ phase, error }));
  throw error;
};

const unexpectedLifecycleError = (
  phase: Exclude<
    ProcessorBrowserLifecyclePhase,
    'root-lookup' | 'root-reservation'
  >,
  cause: unknown,
): AppError =>
  unexpectedError({
    code: `processor_browser_${phase.replace('-', '_')}_failed`,
    message: `Processor browser lifecycle failed during ${phase}.`,
    safeMessage: 'The application could not complete its browser lifecycle.',
    cause,
    details: { phase },
  });

const cleanup = (
  root: ProcessorBrowserRoot | undefined,
  application: ProcessorBrowserApplication | undefined,
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

export const startProcessorBrowserHost = (
  input: StartProcessorBrowserHostInput,
): ProcessorBrowserHost => {
  const container = input.environment.document.getElementById(input.rootId);
  if (container === null)
    return throwObserved(
      input.observeFailure,
      'root-lookup',
      configError({
        code: 'processor_browser_root_missing',
        message: `Processor browser root element "${input.rootId}" was not found.`,
        safeMessage: 'The application root is unavailable.',
        details: { rootId: input.rootId },
      }),
    );

  if (mountedRoots.has(container))
    return throwObserved(
      input.observeFailure,
      'root-reservation',
      configError({
        code: 'processor_browser_root_already_mounted',
        message: `Processor browser root element "${input.rootId}" is already mounted.`,
        safeMessage: 'The application is already running.',
        details: { rootId: input.rootId },
      }),
    );

  let application: ProcessorBrowserApplication | undefined;
  let root: ProcessorBrowserRoot | undefined;
  let disposed = false;

  const lifecycle: ProcessorBrowserHost = Object.freeze({
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
              message: 'Processor browser teardown failures.',
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
      `Processor browser ${phase} and cleanup failed.`,
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
