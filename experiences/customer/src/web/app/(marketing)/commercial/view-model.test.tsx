import { renderHook } from '@testing-library/react';

import { useCommercialInquiryViewModel } from '#customer/app/(marketing)/commercial/view-model';
import { trackPublicEvent } from '#customer/telemetry/model/track';
import { makeTestWebCore } from '@test/support/make-test-web-core';

describe('useCommercialInquiryViewModel', () => {
  it('tracks a completed, valid commercial inquiry', () => {
    const core = makeTestWebCore({ route: '/commercial' });
    const { result } = renderHook(() =>
      useCommercialInquiryViewModel(trackPublicEvent(core)),
    );

    result.current.submit({
      companyName: 'Pressly Test Co.',
      firstName: 'Pat',
      lastName: 'Lee',
      email: 'pat@example.com',
      phone: '8623106447',
      location: 'Newark, NJ',
      needs: 'Weekly towel service for our studio.',
    });

    expect(core.calls.analytics).toEqual([
      {
        kind: 'track',
        event: {
          name: 'commercial_inquiry_form_completed',
          schemaVersion: 1,
          properties: { source: 'commercial_form' },
        },
        context: {
          route: '/commercial',
          sessionId: 'session_test',
          distinctId: 'distinct_test',
        },
      },
    ]);
  });
});
