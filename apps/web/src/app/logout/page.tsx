import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NOINDEX_ROBOTS } from '@/app/_lib/seo';
import { CENTS_ORDER_URL } from '@/features/order-entry/config';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export default function LogoutRedirectPage() {
  redirect(CENTS_ORDER_URL);
}
