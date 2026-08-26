import type {
  ProcessorBrowserCapabilities,
  ProcessorBrowserKeyInput,
} from '@pressly/topology/browser';

const editableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
};

export const makeProcessorBrowserCapabilities = (input: {
  window: Window;
  document: Document;
  navigator: Navigator;
}): ProcessorBrowserCapabilities => {
  const readConnectivity = () =>
    Object.freeze({
      online: input.navigator.onLine,
      visible: input.document.visibilityState === 'visible',
    });

  return Object.freeze({
    storage: Object.freeze({
      read: (key) => input.window.localStorage.getItem(key),
      write: (key, value) => input.window.localStorage.setItem(key, value),
      remove: (key) => input.window.localStorage.removeItem(key),
      subscribe: (listener) => {
        const handleStorage = (event: StorageEvent) => {
          if (event.storageArea !== input.window.localStorage) return;
          listener(Object.freeze({ key: event.key, newValue: event.newValue }));
        };
        input.window.addEventListener('storage', handleStorage);
        return () => input.window.removeEventListener('storage', handleStorage);
      },
    }),
    localization: Object.freeze({
      applyLanguage: (language) => {
        input.document.documentElement.lang = language;
        input.document.documentElement.dir = 'ltr';
      },
      readLanguage: () => input.document.documentElement.lang,
    }),
    theme: Object.freeze({
      system: () =>
        input.window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light',
      apply: (theme) => {
        input.document.documentElement.classList.remove('light', 'dark');
        input.document.documentElement.classList.add(theme);
      },
      suppressTransitions: () => {
        const style = input.document.createElement('style');
        style.appendChild(
          input.document.createTextNode(
            '*,*::before,*::after{-webkit-transition:none!important;transition:none!important}',
          ),
        );
        input.document.head.appendChild(style);
        return () => {
          input.window.getComputedStyle(input.document.body);
          input.window.requestAnimationFrame(() => {
            input.window.requestAnimationFrame(() => style.remove());
          });
        };
      },
      subscribeSystem: (listener) => {
        const media = input.window.matchMedia('(prefers-color-scheme: dark)');
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
      },
    }),
    keyboard: Object.freeze({
      subscribe: (listener) => {
        const handleKeyDown = (event: KeyboardEvent) =>
          listener(
            Object.freeze({
              key: event.key,
              repeat: event.repeat,
              metaKey: event.metaKey,
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              editable: editableTarget(event.target),
              preventDefault: () => event.preventDefault(),
            }) satisfies ProcessorBrowserKeyInput,
          );
        input.window.addEventListener('keydown', handleKeyDown);
        return () => input.window.removeEventListener('keydown', handleKeyDown);
      },
    }),
    viewport: Object.freeze({
      matches: (query) =>
        typeof input.window.matchMedia === 'function'
          ? input.window.matchMedia(query).matches
          : null,
      subscribe: (query, listener) => {
        if (typeof input.window.matchMedia !== 'function')
          return () => undefined;
        const media = input.window.matchMedia(query);
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
      },
    }),
    connectivity: Object.freeze({
      read: readConnectivity,
      subscribe: (listener) => {
        const publish = () => listener(readConnectivity());
        input.window.addEventListener('online', publish);
        input.window.addEventListener('offline', publish);
        input.document.addEventListener('visibilitychange', publish);
        return () => {
          input.window.removeEventListener('online', publish);
          input.window.removeEventListener('offline', publish);
          input.document.removeEventListener('visibilitychange', publish);
        };
      },
    }),
    clock: Object.freeze({
      now: () => new Date(),
      monotonicNow: () => input.window.performance.now(),
    }),
    scheduler: Object.freeze({
      schedule: (callback, delayMs) => {
        const handle = input.window.setTimeout(callback, delayMs);
        return () => input.window.clearTimeout(handle);
      },
      repeat: (callback, intervalMs) => {
        const handle = input.window.setInterval(callback, intervalMs);
        return () => input.window.clearInterval(handle);
      },
    }),
    navigation: Object.freeze({ reload: () => input.window.location.reload() }),
    cookies: Object.freeze({
      write: (name, value, maxAgeSeconds) => {
        input.document.cookie = `${name}=${value}; path=/; max-age=${String(maxAgeSeconds)}`;
      },
    }),
  } satisfies ProcessorBrowserCapabilities);
};
