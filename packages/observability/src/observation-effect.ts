export type ObservationAttempt =
  | Readonly<{ tag: 'observed' }>
  | Readonly<{ tag: 'failed'; error: unknown }>;

export type ObservationValueAttempt<Value> =
  | Readonly<{ tag: 'observed'; value: Value }>
  | Readonly<{ tag: 'failed'; error: unknown }>;

/**
 * Reads non-authoritative observation data without allowing a failed clock,
 * context provider, or similar port to replace the outcome being observed.
 */
export const attemptObservationValue = <Value>(
  effect: () => Value,
): ObservationValueAttempt<Value> => {
  try {
    return { tag: 'observed', value: effect() };
  } catch (error: unknown) {
    return { tag: 'failed', error };
  }
};

/**
 * Runs a non-authoritative observation without allowing that secondary effect
 * to replace the business or runtime outcome being observed.
 */
export const attemptObservation = (effect: () => void): ObservationAttempt => {
  const attempted = attemptObservationValue(effect);

  return attempted.tag === 'observed'
    ? { tag: 'observed' }
    : { tag: 'failed', error: attempted.error };
};

/** Async counterpart for non-authoritative flush and shutdown observations. */
export const attemptAsyncObservationValue = async <Value>(
  effect: () => Promise<Value>,
): Promise<ObservationValueAttempt<Value>> => {
  try {
    return { tag: 'observed', value: await effect() };
  } catch (error: unknown) {
    return { tag: 'failed', error };
  }
};

export const attemptAsyncObservation = async (
  effect: () => Promise<unknown>,
): Promise<ObservationAttempt> => {
  const attempted = await attemptAsyncObservationValue(effect);

  return attempted.tag === 'observed'
    ? { tag: 'observed' }
    : { tag: 'failed', error: attempted.error };
};
