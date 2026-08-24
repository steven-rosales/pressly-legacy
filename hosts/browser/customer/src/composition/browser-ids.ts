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
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return crypto.randomUUID();

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
