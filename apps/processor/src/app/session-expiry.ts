export const maximumBrowserTimeoutMs = 2_147_483_647;

type TimeoutHandle = ReturnType<typeof globalThis.setTimeout>;

export type SessionExpiryScheduler = Readonly<{
  now?: () => number;
  setTimeout?: (callback: () => void, delay: number) => TimeoutHandle;
  clearTimeout?: (handle: TimeoutHandle) => void;
}>;

/**
 * Arms an absolute session-expiry callback without relying on a timeout longer
 * than browsers can represent. Long sessions are checked in bounded segments
 * until their true expiry is reached.
 */
export const scheduleSessionExpiry = (
  expiresAt: string,
  onExpired: () => void,
  scheduler: SessionExpiryScheduler = {},
): (() => void) => {
  const now = scheduler.now ?? Date.now;
  const setTimeout = scheduler.setTimeout ?? globalThis.setTimeout;
  const clearTimeout = scheduler.clearTimeout ?? globalThis.clearTimeout;
  const expiresAtMs = Date.parse(expiresAt);
  let cancelled = false;
  let handle: TimeoutHandle | undefined;

  const arm = () => {
    if (cancelled) return;
    const remaining = expiresAtMs - now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      onExpired();
      return;
    }
    handle = setTimeout(arm, Math.min(remaining, maximumBrowserTimeoutMs));
  };

  arm();

  return () => {
    cancelled = true;
    if (handle !== undefined) clearTimeout(handle);
  };
};
