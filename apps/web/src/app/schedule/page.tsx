import type { Metadata, Viewport } from 'next';

import ScheduleRoute from '@/routes/schedule/route';

export const metadata: Metadata = {
  title: 'Schedule a Pickup',
  description: 'Schedule a Pressly laundry or dry cleaning pickup.',
  robots: {
    index: false,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default ScheduleRoute;
