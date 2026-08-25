import type {
  CellOutcome,
  SubscriptionObserver,
  SubscriptionSession,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  ProductionChangeEvent,
  ProductionChangeSource,
  ProductionChangeSourceEvent,
  SubscribeProductionChangesFailure,
  SubscribeProductionChangesInput,
  SubscribeProductionChangesReady,
} from './types.ts';

export type SubscribeProductionChangesDependencies = Readonly<{
  source: ProductionChangeSource;
}>;

export type OpenProductionChanges = (
  input: SubscribeProductionChangesInput,
) => Promise<
  CellOutcome<
    SubscriptionSession<SubscribeProductionChangesReady, ProductionChangeEvent>,
    SubscribeProductionChangesFailure
  >
>;

const alreadySubscribed = () =>
  invariantViolationError({
    code: 'production_change_session_already_subscribed',
    message: 'A production change session may be subscribed exactly once.',
  });

const missingLocation = (
  locationId: string,
): SubscribeProductionChangesFailure => ({
  kind: 'not_found',
  code: 'production_location_not_found',
  message: `Production location ${locationId} was not found.`,
  safeMessage: 'The production location was not found.',
});

export const makeOpenProductionChanges =
  (
    dependencies: SubscribeProductionChangesDependencies,
  ): OpenProductionChanges =>
  async (input) => {
    let observer: SubscriptionObserver<ProductionChangeEvent> | null = null;
    let readyRevision: number | null = null;
    let bufferedRevision: number | null = null;
    let bufferedResync = false;
    let sourceClosed = false;
    let sessionClosed = false;
    let subscribed = false;

    const onSourceEvent = (event: ProductionChangeSourceEvent): void => {
      if (sessionClosed || sourceClosed) return;
      if (event.kind === 'shutdown') {
        sourceClosed = true;
        observer?.close();
        return;
      }

      if (observer === null) {
        if (event.kind === 'resync') bufferedResync = true;
        else
          bufferedRevision = Math.max(
            bufferedRevision ?? event.revision,
            event.revision,
          );
        return;
      }

      observer.next(
        event.kind === 'resync'
          ? { kind: 'resync', reason: 'upstream_reconnected' }
          : { kind: 'change', revision: event.revision },
      );
    };

    const unsubscribeSource = dependencies.source.subscribe(
      input.locationId,
      onSourceEvent,
    );

    try {
      readyRevision = await dependencies.source.currentRevision(
        input.locationId,
      );
    } catch (error: unknown) {
      unsubscribeSource();
      throw error;
    }

    if (readyRevision === null) {
      unsubscribeSource();
      return { kind: 'failure', failure: missingLocation(input.locationId) };
    }

    const close = (): void => {
      if (sessionClosed) return;
      sessionClosed = true;
      observer = null;
      unsubscribeSource();
    };

    const session: SubscriptionSession<
      SubscribeProductionChangesReady,
      ProductionChangeEvent
    > = Object.freeze({
      ready: Object.freeze({ revision: readyRevision }),
      subscribe: (nextObserver) => {
        if (subscribed) throw alreadySubscribed();
        subscribed = true;
        if (sessionClosed) return () => undefined;
        observer = nextObserver;

        if (sourceClosed) nextObserver.close();
        else if (bufferedResync)
          nextObserver.next({
            kind: 'resync',
            reason: 'upstream_reconnected',
          });
        else if (bufferedRevision !== null && bufferedRevision > readyRevision)
          nextObserver.next({
            kind: 'change',
            revision: bufferedRevision,
          });

        return () => {
          if (observer === nextObserver) observer = null;
        };
      },
      close,
    });

    return { kind: 'success', value: session };
  };
