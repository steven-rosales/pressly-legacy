import type { ProductEvent } from '@pressly/metrics';
import type { WebCore } from '../runtime/core';

export const trackPublicEvent =
  (core: WebCore) =>
  (event: ProductEvent): void => {
    const context = core.context.get();

    core.analytics.track(event, {
      route: context.route,
      sessionId: context.sessionId,
      distinctId: context.distinctId,
    });
  };
