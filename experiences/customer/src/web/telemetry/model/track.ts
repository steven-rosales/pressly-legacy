import type { ProductEvent } from '@pressly/observability';
import type { WebCorePorts } from '../../composition/model/ports';

export type TrackPublicEvent = (event: ProductEvent) => void;

export const trackPublicEvent =
  (core: Pick<WebCorePorts, 'analytics' | 'context'>): TrackPublicEvent =>
  (event): void => {
    const context = core.context.get();

    core.analytics.track(event, {
      route: context.route,
      sessionId: context.sessionId,
      distinctId: context.distinctId,
    });
  };
