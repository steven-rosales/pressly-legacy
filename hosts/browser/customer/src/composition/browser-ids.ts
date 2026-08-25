const fallbackId = 'unavailable';

const canUseStorage = (): boolean => {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined'
    );
  } catch {
    return false;
  }
};

const createId = (): string => {
  const browserCrypto = globalThis.crypto;
  if (browserCrypto === undefined) return fallbackId;

  try {
    if (typeof browserCrypto.randomUUID === 'function')
      return browserCrypto.randomUUID();

    if (typeof browserCrypto.getRandomValues !== 'function') return fallbackId;

    return Array.from(browserCrypto.getRandomValues(new Uint8Array(16)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return fallbackId;
  }
};

export const getOrCreateBrowserId = (key: string): string => {
  if (!canUseStorage()) return fallbackId;

  try {
    const current = window.localStorage.getItem(key);

    if (current !== null && current.length > 0) return current;

    const next = createId();

    window.localStorage.setItem(key, next);

    return next;
  } catch {
    return createId();
  }
};
