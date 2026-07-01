import { makeTestWebCore } from '@/common/testing/make-test-web-core';
import { publicEvents } from '@/common/core/analytics/events';
import { trackPublicEvent } from '@/common/core/analytics/track';

describe('trackPublicEvent', () => {
  it('tracks product event with web context', () => {
    const core = makeTestWebCore({
      route: '/pricing',
      sessionId: 'session_123',
      distinctId: 'distinct_123',
    });

    trackPublicEvent(core)(
      publicEvents.locationPageViewed({ locationSlug: 'hero' }),
    );

    expect(core.calls.analytics).toEqual([
      {
        kind: 'track',
        event: {
          name: 'location_page_viewed',
          schemaVersion: 1,
          properties: {
            location_slug: 'hero',
          },
        },
        context: {
          route: '/pricing',
          sessionId: 'session_123',
          distinctId: 'distinct_123',
        },
      },
    ]);
  });
});
