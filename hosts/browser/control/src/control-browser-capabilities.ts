import type { ControlBrowserCapabilities } from '@pressly/generated-runtime/browser/control';

export const makeControlBrowserCapabilities = (input: {
  window: Window;
  document: Document;
  navigator: Navigator;
  crypto: Crypto;
}): ControlBrowserCapabilities =>
  Object.freeze({
    storage: Object.freeze({
      read: (key) => input.window.localStorage.getItem(key),
      write: (key, value) => input.window.localStorage.setItem(key, value),
    }),
    localization: Object.freeze({
      applyLanguage: (language) => {
        input.document.documentElement.lang = language;
        input.document.documentElement.dir = 'ltr';
      },
    }),
    theme: Object.freeze({
      apply: (theme) => {
        input.document.documentElement.classList.remove('light', 'dark');
        input.document.documentElement.classList.add(theme);
      },
      subscribe: (listener) => {
        const handleStorage = (event: StorageEvent) => {
          if (event.storageArea !== input.window.localStorage) return;
          listener(Object.freeze({ key: event.key, newValue: event.newValue }));
        };
        input.window.addEventListener('storage', handleStorage);
        return () => input.window.removeEventListener('storage', handleStorage);
      },
    }),
    clipboard: Object.freeze({
      writeText: (value) => input.navigator.clipboard.writeText(value),
    }),
    navigation: Object.freeze({
      read: () =>
        Object.freeze({
          hash: input.window.location.hash,
          hostname: input.window.location.hostname,
          origin: input.window.location.origin,
          pathname: input.window.location.pathname,
          search: input.window.location.search,
        }),
      replace: (path) =>
        input.window.history.replaceState(input.window.history.state, '', path),
      reload: () => input.window.location.reload(),
    }),
    clock: Object.freeze({
      now: () => new Date(),
      schedule: (callback, delayMs) => {
        const handle = input.window.setTimeout(callback, delayMs);
        return () => input.window.clearTimeout(handle);
      },
    }),
    ids: Object.freeze({ next: () => input.crypto.randomUUID() }),
  } satisfies ControlBrowserCapabilities);
