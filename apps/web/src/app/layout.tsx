import type { Metadata } from 'next';
import { Lexend_Deca } from 'next/font/google';
import type { ReactNode } from 'react';
import { SITE_URL } from '@/lib/content';
import { JsonLd } from '@/common/seo/JsonLd';
import { buildOrganizationJsonLd } from '@/lib/seo';
import '@/styles/globals.css';

const lexend = Lexend_Deca({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-lexend-deca',
  preload: true,
  fallback: ['system-ui', 'arial'],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Pressly - Laundry & Dry Cleaning',
    template: '%s | Pressly',
  },
  description: 'Wash & Fold and Dry Cleaning Delivery.',
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/logo/favicon.ico',
  },
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={lexend.className}>
      <body className="antialiased">
        <JsonLd data={buildOrganizationJsonLd()} />
        {children}
      </body>
    </html>
  );
}
