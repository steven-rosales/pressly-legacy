import posthog from 'posthog-js';
import { makeBrowserPostHogTracker } from '@/telemetry/posthog-tracker';

const intentStarted = {
  name: 'order_intent_started',
  schemaVersion: 1,
  properties: { source: 'hero', vendor: 'cents' },
} as const;

vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
    identify: vi.fn(),
  },
}));

describe('makeBrowserPosthogTracker', () => {
  it('does nothing when disabled', () => {
    const tracker = makeBrowserPostHogTracker(false);

    tracker.track(intentStarted);

    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('captures typed product events when enabled', () => {
    const tracker = makeBrowserPostHogTracker(true);

    tracker.track(intentStarted, {
      route: '/',
      sessionId: 'session_123',
      distinctId: 'distinct_123',
    });

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
