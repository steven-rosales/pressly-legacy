export type ProductionSyncTarget<T> = Readonly<{
  key: string
  load: (signal: AbortSignal) => Promise<T>
}>

export type ProductionSyncCoordinator<T> = Readonly<{
  setTarget: (
    target: ProductionSyncTarget<T> | null,
    options?: Readonly<{ reuseCurrent?: boolean }>
  ) => void
  setAvailable: (available: boolean) => void
  refresh: (
    options?: Readonly<{ afterMutation?: boolean }>
  ) => Promise<T | null>
  stop: () => void
}>

type Deferred<T> = Readonly<{
  promise: Promise<T>
  resolve: (value: T) => void
}>

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

const aborted = (controller: AbortController, cause: unknown): boolean =>
  controller.signal.aborted ||
  (cause instanceof DOMException && cause.name === "AbortError")

/**
 * Coalesces initial loads, mutation refreshes, and SSE invalidations without a
 * timer. Server state changes are announced by the production change stream.
 */
export const makeProductionSyncCoordinator = <T>(input: {
  onStart: () => void
  onSuccess: (snapshot: T) => void
  onError: (cause: unknown) => void
}): ProductionSyncCoordinator<T> => {
  let target: ProductionSyncTarget<T> | null = null
  let available = false
  let stopped = false
  let controller: AbortController | null = null
  let inFlight: Promise<T | null> | null = null
  let cancellationBarrier: Promise<T | null> | null = null
  let queuedRefresh: Deferred<T | null> | null = null
  let generation = 0

  const resolveQueued = (value: T | null): void => {
    const queued = queuedRefresh
    queuedRefresh = null
    queued?.resolve(value)
  }

  const cancelRequest = (): void => {
    generation += 1
    controller?.abort()
    controller = null
    const cancelled = inFlight
    inFlight = null
    if (cancelled === null) return
    const barrier = cancelled.finally(() => {
      if (cancellationBarrier === barrier) cancellationBarrier = null
    })
    cancellationBarrier = barrier
  }

  const execute = (): Promise<T | null> => {
    if (stopped || !available || target === null) return Promise.resolve(null)
    if (cancellationBarrier !== null)
      return cancellationBarrier.then(() => execute())
    if (inFlight !== null) return inFlight

    const activeTarget = target
    const activeGeneration = ++generation
    const activeController = new AbortController()
    controller = activeController
    input.onStart()

    const request = activeTarget
      .load(activeController.signal)
      .then((snapshot) => {
        if (
          stopped ||
          !available ||
          activeGeneration !== generation ||
          target?.key !== activeTarget.key
        )
          return null
        input.onSuccess(snapshot)
        return snapshot
      })
      .catch((cause: unknown) => {
        if (
          aborted(activeController, cause) ||
          stopped ||
          activeGeneration !== generation ||
          target?.key !== activeTarget.key
        )
          return null
        input.onError(cause)
        return null
      })
      .finally(() => {
        if (activeGeneration !== generation) return
        controller = null
        inFlight = null
        if (stopped || !available || target?.key !== activeTarget.key) {
          resolveQueued(null)
          return
        }
        if (queuedRefresh !== null) {
          const queued = queuedRefresh
          queuedRefresh = null
          void execute().then(queued.resolve)
        }
      })

    inFlight = request
    return request
  }

  return {
    setTarget: (nextTarget, options = {}) => {
      if (stopped) return
      if (target?.key === nextTarget?.key) {
        target = nextTarget
        return
      }

      cancelRequest()
      resolveQueued(null)
      target = nextTarget
      if (available && nextTarget !== null && options.reuseCurrent !== true)
        void execute()
    },
    setAvailable: (nextAvailable) => {
      if (stopped || available === nextAvailable) return
      available = nextAvailable
      if (!available) {
        cancelRequest()
        resolveQueued(null)
        return
      }
      void execute()
    },
    refresh: (options = {}) => {
      if (stopped || !available || target === null) return Promise.resolve(null)
      if (inFlight === null && cancellationBarrier === null) return execute()
      if (options.afterMutation !== true) {
        if (inFlight !== null) return inFlight
        if (cancellationBarrier !== null)
          return cancellationBarrier.then(() => execute())
        return execute()
      }
      if (queuedRefresh === null) queuedRefresh = deferred<T | null>()
      const queued = queuedRefresh
      if (inFlight === null && cancellationBarrier !== null)
        void cancellationBarrier.then(() => {
          if (
            queuedRefresh !== queued ||
            stopped ||
            !available ||
            target === null
          )
            return
          queuedRefresh = null
          void execute().then(queued.resolve)
        })
      return queued.promise
    },
    stop: () => {
      if (stopped) return
      stopped = true
      available = false
      target = null
      cancelRequest()
      resolveQueued(null)
    },
  }
}
