import posthog from 'posthog-js';
import { publicEvents } from '@/common/core/analytics/events';
import { makeBrowserPostHogTracker } from './posthog-tracker';

jest.mock('posthog-js', () => ({
  capture: jest.fn(),
  identify: jest.fn(),
}));

describe('makeBrowserPosthogTracker', () => {
  it('does nothing when disabled', () => {
    const tracker = makeBrowserPostHogTracker(false);

    tracker.track(
      publicEvents.orderIntentStarted({ source: 'hero', vendor: 'cents' }),
    );

    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('captures typed product events when enabled', () => {
    const tracker = makeBrowserPostHogTracker(true);

    tracker.track(
      publicEvents.orderIntentStarted({ source: 'hero', vendor: 'cents' }),
      {
        route: '/',
        sessionId: 'session_123',
        distinctId: 'distinct_123',
      },
    );

    expect(posthog.capture).toHaveBeenCalledWith(
      'order_intent_started',
      {
        source: 'hero',
        vendor: 'cents',
        schema_version: 1,
        session_id: 'session_123',
        request_id: undefined,
        trace_id: undefined,
        route: '/',
      },
      {
        send_instantly: true,
        transport: 'sendBeacon',
      },
    );
  });
});
