import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CENTS_ORDER_URL } from '@/lib/content';
import { NOINDEX_ROBOTS } from '@/lib/seo';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export default function LogoutRedirectPage() {
  redirect(CENTS_ORDER_URL);
}
