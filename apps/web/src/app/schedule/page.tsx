import type { Metadata } from 'next';

import ScheduleRoute from '@/routes/schedule/route';

export const metadata: Metadata = {
  title: 'Schedule a Pickup',
  description: 'Schedule a Pressly laundry or dry cleaning pickup.',
  robots: {
    index: false,
    follow: true,
  },
};

export default ScheduleRoute;
