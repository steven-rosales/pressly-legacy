type Deferred = Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}>;

const makeDeferred = (): Deferred => {
  let release = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return Object.freeze({ promise, resolve: release });
};

export type AdvanceStagePreLockMissParticipant = Readonly<{
  waitAfterInitialMiss: () => Promise<void>;
  transactionSettled: () => void;
}>;

export type AdvanceStagePreLockMissBarrier = Readonly<{
  participate: () => AdvanceStagePreLockMissParticipant;
  initialMissCount: () => number;
}>;

/**
 * Makes every participant prove an initial idempotency miss before any may
 * acquire the execution aggregate lock. Participant zero then commits first;
 * followers remain open and continue through the after-lock replay check.
 */
export const makeDeterministicPreLockMissBarrier = (
  expectedParticipants: number,
): AdvanceStagePreLockMissBarrier => {
  const allArrived = makeDeferred();
  const leaderSettled = makeDeferred();
  let participants = 0;
  let initialMisses = 0;

  return Object.freeze({
    participate: () => {
      const ordinal = participants++;
      let observedInitialMiss = false;
      return Object.freeze({
        waitAfterInitialMiss: async (): Promise<void> => {
          if (observedInitialMiss) return;
          observedInitialMiss = true;
          initialMisses += 1;
          if (initialMisses === expectedParticipants) allArrived.resolve();
          await allArrived.promise;
          if (ordinal > 0) await leaderSettled.promise;
        },
        transactionSettled: (): void => {
          if (ordinal === 0) leaderSettled.resolve();
        },
      });
    },
    initialMissCount: () => initialMisses,
  });
};

export const makeBarrieredFindWorkEvent = <StoredWorkEvent>(
  findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>,
  participant: AdvanceStagePreLockMissParticipant | undefined,
): ((idempotencyKey: string) => Promise<StoredWorkEvent | null>) => {
  let initialLookup = true;
  return async (idempotencyKey) => {
    const event = await findWorkEvent(idempotencyKey);
    if (initialLookup) {
      initialLookup = false;
      if (event === null) await participant?.waitAfterInitialMiss();
    }
    return event;
  };
};
