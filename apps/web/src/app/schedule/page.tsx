import type { Metadata, Viewport } from 'next';

import { NOINDEX_ROBOTS, buildPageMetadata } from '@/app/shared/marketing/seo';
import { getSchedulePageModel } from './model';
import ScheduleShell from './ui/ScheduleShell';

export const metadata: Metadata = buildPageMetadata({
  title: 'Schedule a Pickup',
  description: 'Schedule a Pressly laundry or dry cleaning pickup.',
  path: '/schedule',
  robots: {
    ...NOINDEX_ROBOTS,
    follow: true,
  },
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function SchedulePage() {
  return <ScheduleShell model={getSchedulePageModel()} />;
}
