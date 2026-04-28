import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CENTS_ORDER_URL } from '@/routes/shared/marketing/content';
import { NOINDEX_ROBOTS } from '@/routes/shared/marketing/seo';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export default function AccountRedirectPage() {
  redirect(CENTS_ORDER_URL);
}
