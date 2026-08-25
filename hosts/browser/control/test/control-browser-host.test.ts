import { unexpectedError } from '@pressly/errors/factories';
import {
  isValidElement,
  StrictMode,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  startControlBrowserHost,
  type ControlBrowserApplication,
  type ControlBrowserEnvironment,
  type ControlBrowserRoot,
  type StartControlBrowserHostInput,
} from '../src/control-browser-host.js';

const makeEnvironment = (
  container: HTMLElement | null,
  onLookup: () => void = () => undefined,
): ControlBrowserEnvironment => ({
  document: {
    getElementById: () => {
      onLookup();
      return container;
    },
  },
  history: {} as History,
  location: {} as Location,
  storage: {} as Storage,
  events: {} as ControlBrowserEnvironment['events'],
});

const makeFixture = () => {
  const container = {} as HTMLElement;
  const environment = makeEnvironment(container);
  const render = vi.fn();
  const unmount = vi.fn();
  const disposeApplication = vi.fn();
  const application = {
    node: 'control application',
    dispose: disposeApplication,
  } satisfies ControlBrowserApplication;
  const root = { render, unmount } satisfies ControlBrowserRoot;
  const initialize = vi.fn(() => application);
  const observeFailure = vi.fn();
  const createRoot = vi.fn((_container: Element) => root);

  return {
    container,
    environment,
    application,
    root,
    initialize,
    observeFailure,
    createRoot,
    render,
    unmount,
    disposeApplication,
  };
};

type Fixture = ReturnType<typeof makeFixture>;

const start = (
  fixture: Fixture,
  overrides: Partial<StartControlBrowserHostInput> = {},
) =>
  startControlBrowserHost({
    rootId: 'root',
    strictMode: true,
    environment: fixture.environment,
    initialize: fixture.initialize,
    observeFailure: fixture.observeFailure,
    createRoot: fixture.createRoot,
    ...overrides,
  });

const captureFailure = (action: () => unknown): unknown => {
  try {
    action();
  } catch (failure: unknown) {
    return failure;
  }

  return undefined;
};

const fixtureFailure = (code: string) =>
  unexpectedError({
    code,
    message: `Deliberate browser-host fault fixture: ${code}.`,
  });

describe('startControlBrowserHost', () => {
  it('fails closed before initialization when the declared root is missing', () => {
    const fixture = makeFixture();
    const environment = makeEnvironment(null);

    const failure = captureFailure(() => start(fixture, { environment }));

    expect(failure).toMatchObject({
      tag: 'AppError',
      kind: 'ConfigError',
      code: 'control_browser_root_missing',
    });
    expect(fixture.initialize).not.toHaveBeenCalled();
    expect(fixture.createRoot).not.toHaveBeenCalled();
    expect(fixture.observeFailure).toHaveBeenCalledOnce();
    expect(fixture.observeFailure).toHaveBeenCalledWith({
      phase: 'root-lookup',
      error: failure,
    });
  });

  it('initializes, creates one root, and renders once in deterministic order', () => {
    const order: string[] = [];
    const fixture = makeFixture();
    const environment = makeEnvironment(fixture.container, () =>
      order.push('lookup'),
    );
    const initialize = vi.fn(() => {
      order.push('initialize');
      return fixture.application;
    });
    const createRoot = vi.fn((_container: Element) => {
      order.push('create-root');
      return {
        render: (node: ReactNode) => {
          order.push('render');
          fixture.render(node);
        },
        unmount: fixture.unmount,
      };
    });

    const host = start(fixture, { environment, initialize, createRoot });

    expect(order).toEqual(['lookup', 'initialize', 'create-root', 'render']);
    expect(initialize).toHaveBeenCalledWith(environment);
    expect(createRoot).toHaveBeenCalledExactlyOnceWith(fixture.container);
    expect(fixture.render).toHaveBeenCalledOnce();
    const rendered = fixture.render.mock.calls[0]?.[0] as ReactElement<{
      children: ReactNode;
    }>;
    expect(isValidElement(rendered)).toBe(true);
    expect(rendered.type).toBe(StrictMode);
    expect(rendered.props.children).toBe(fixture.application.node);

    host.dispose();
  });

  it('renders the application node directly when StrictMode is disabled', () => {
    const fixture = makeFixture();

    const host = start(fixture, { strictMode: false });

    expect(fixture.render).toHaveBeenCalledExactlyOnceWith(
      fixture.application.node,
    );
    host.dispose();
  });

  it('rejects a second mount against the same element without recreating it', () => {
    const fixture = makeFixture();
    const first = start(fixture);

    const failure = captureFailure(() => start(fixture));

    expect(failure).toMatchObject({
      tag: 'AppError',
      kind: 'ConfigError',
      code: 'control_browser_root_already_mounted',
    });
    expect(fixture.initialize).toHaveBeenCalledTimes(1);
    expect(fixture.createRoot).toHaveBeenCalledTimes(1);
    expect(fixture.render).toHaveBeenCalledTimes(1);
    expect(fixture.observeFailure).toHaveBeenCalledExactlyOnceWith({
      phase: 'root-reservation',
      error: failure,
    });

    first.dispose();
  });

  it('unmounts before application cleanup exactly once and permits remount', () => {
    const order: string[] = [];
    const fixture = makeFixture();
    fixture.unmount.mockImplementation(() => order.push('unmount'));
    fixture.disposeApplication.mockImplementation(() =>
      order.push('application-dispose'),
    );
    const first = start(fixture);

    first.dispose();
    first.dispose();

    expect(order).toEqual(['unmount', 'application-dispose']);
    expect(fixture.unmount).toHaveBeenCalledTimes(1);
    expect(fixture.disposeApplication).toHaveBeenCalledTimes(1);

    const second = start(fixture);
    expect(fixture.createRoot).toHaveBeenCalledTimes(2);
    second.dispose();
  });

  it('observes initialization failure once and releases the root reservation', () => {
    const fixture = makeFixture();
    let shouldFail = true;
    const initialize = vi.fn(() => {
      if (shouldFail) throw fixtureFailure('fixture_initialization_failed');
      return fixture.application;
    });

    const failure = captureFailure(() => start(fixture, { initialize }));

    expect(failure).toMatchObject({
      tag: 'AppError',
      kind: 'UnexpectedError',
      code: 'control_browser_initialize_failed',
    });
    expect(fixture.createRoot).not.toHaveBeenCalled();
    expect(fixture.observeFailure).toHaveBeenCalledExactlyOnceWith({
      phase: 'initialize',
      error: failure,
    });

    shouldFail = false;
    const host = start(fixture, { initialize });
    host.dispose();
  });

  it('cleans initialized resources after root creation fails', () => {
    const fixture = makeFixture();
    let shouldFail = true;
    const createRoot = vi.fn((_container: Element) => {
      if (shouldFail) throw fixtureFailure('fixture_root_creation_failed');
      return fixture.root;
    });

    const failure = captureFailure(() => start(fixture, { createRoot }));

    expect(failure).toMatchObject({
      tag: 'AppError',
      code: 'control_browser_root_create_failed',
    });
    expect(fixture.disposeApplication).toHaveBeenCalledTimes(1);
    expect(fixture.unmount).not.toHaveBeenCalled();
    expect(fixture.observeFailure).toHaveBeenCalledExactlyOnceWith({
      phase: 'root-create',
      error: failure,
    });

    shouldFail = false;
    const host = start(fixture, { createRoot });
    host.dispose();
  });

  it('unmounts and cleans initialized resources after render fails', () => {
    const fixture = makeFixture();
    let shouldFail = true;
    fixture.render.mockImplementation(() => {
      if (shouldFail) throw fixtureFailure('fixture_render_failed');
    });

    const failure = captureFailure(() => start(fixture));

    expect(failure).toMatchObject({
      tag: 'AppError',
      code: 'control_browser_render_failed',
    });
    expect(fixture.unmount).toHaveBeenCalledTimes(1);
    expect(fixture.disposeApplication).toHaveBeenCalledTimes(1);
    expect(fixture.observeFailure).toHaveBeenCalledExactlyOnceWith({
      phase: 'render',
      error: failure,
    });

    shouldFail = false;
    const host = start(fixture);
    host.dispose();
  });

  it('attempts every teardown once and observes one aggregate failure', () => {
    const fixture = makeFixture();
    fixture.unmount.mockImplementation(() => {
      throw fixtureFailure('fixture_unmount_failed');
    });
    fixture.disposeApplication.mockImplementation(() => {
      throw fixtureFailure('fixture_application_cleanup_failed');
    });
    const host = start(fixture);

    const failure = captureFailure(() => host.dispose());

    expect(failure).toMatchObject({
      tag: 'AppError',
      code: 'control_browser_teardown_failed',
    });
    expect(fixture.unmount).toHaveBeenCalledTimes(1);
    expect(fixture.disposeApplication).toHaveBeenCalledTimes(1);
    expect(fixture.observeFailure).toHaveBeenCalledExactlyOnceWith({
      phase: 'teardown',
      error: failure,
    });
    expect(captureFailure(() => host.dispose())).toBeUndefined();
    expect(fixture.unmount).toHaveBeenCalledTimes(1);
  });

  it('never lets an observation fault replace the lifecycle failure', () => {
    const fixture = makeFixture();
    const observeFailure = vi.fn(() => {
      throw fixtureFailure('fixture_observer_failed');
    });

    const failure = captureFailure(() =>
      start(fixture, {
        environment: makeEnvironment(null),
        observeFailure,
      }),
    );

    expect(observeFailure).toHaveBeenCalledOnce();
    expect(failure).toMatchObject({ code: 'control_browser_root_missing' });
  });
});
