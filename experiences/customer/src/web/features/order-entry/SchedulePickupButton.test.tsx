import { render, screen } from '@testing-library/react';
import { proveExperienceFeature } from '@pressly/testkit/experience-feature-proof';
import { customerOrderEntryFeature } from './feature';
import userEvent from '@testing-library/user-event';
import type { TrackPublicEvent } from '#customer/telemetry/model/track';
import { CENTS_ORDER_URL } from '#customer/features/order-entry/config';
import { SchedulePickupButton } from '#customer/features/order-entry/ui/SchedulePickupButton';
import { OrderEntryTrackingProvider } from '#customer/features/order-entry/ui/tracking';
import { expect, vi } from 'vitest';

proveExperienceFeature({
  featureId: 'customer.web.order-entry',
  feature: customerOrderEntryFeature,
  scenarios: [
    {
      name: 'links to Cents and tracks the order-entry intent on click',
      proves: ['presentation-state', 'component-interaction'],
      run: async () => {
        const user = userEvent.setup();
        const track = vi.fn<TrackPublicEvent>();

        render(
          <OrderEntryTrackingProvider track={track}>
            <SchedulePickupButton source="hero">
              Schedule a Pickup
            </SchedulePickupButton>
          </OrderEntryTrackingProvider>,
        );

        const link = screen.getByRole('link', { name: 'Schedule a Pickup' });
        link.addEventListener('click', (event) => event.preventDefault());

        expect(link).toHaveAttribute('href', CENTS_ORDER_URL);

        await user.click(link);

        expect(track).toHaveBeenCalledTimes(1);
        expect(track.mock.calls[0]?.[0]).toMatchObject({
          name: 'order_intent_started',
          properties: {
            source: 'hero',
            vendor: 'cents',
          },
        });
      },
    },
  ],
});
