import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { JsonLd } from '#customer/app/_components/JsonLd';
import { OrderEntryTrackingProvider } from '#customer/app/_components/OrderEntryTrackingProvider';
import { buildOrganizationJsonLd } from '#customer/app/_lib/seo/site-schema';
import { SITE_URL } from '#customer/config/site';
import { SonnerToaster } from '#customer/presentation/sonner-toaster';

export const customerRootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Pressly - Laundry & Dry Cleaning',
    template: '%s | Pressly',
  },
  description: 'Wash & Fold and Dry Cleaning Delivery.',
  alternates: { canonical: '/' },
  icons: { icon: '/logo/favicon.ico' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Pressly',
    title: 'Pressly - Laundry & Dry Cleaning',
    description: 'Wash & Fold and Dry Cleaning Delivery.',
    images: ['/graphic-img/hero-customer.webp'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pressly - Laundry & Dry Cleaning',
    description: 'Wash & Fold and Dry Cleaning Delivery.',
    images: ['/graphic-img/hero-customer.webp'],
  },
};

export const CustomerRootContent = ({ children }: { children: ReactNode }) => (
  <>
    <JsonLd data={buildOrganizationJsonLd()} />
    <OrderEntryTrackingProvider>
      {children}
      <SonnerToaster />
    </OrderEntryTrackingProvider>
  </>
);
