import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TrackPublicEvent } from '@/common/core/analytics/track';
import { CENTS_ORDER_URL } from '@/features/order-entry/config';
import { SchedulePickupButton } from '@/features/order-entry/ui/SchedulePickupButton';
import { OrderEntryTrackingProvider } from '@/features/order-entry/ui/tracking';

describe('SchedulePickupButton', () => {
  it('links to Cents and tracks the order-entry intent on click', async () => {
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
  });
});
