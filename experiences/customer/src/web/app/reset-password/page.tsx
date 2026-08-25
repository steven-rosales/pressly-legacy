import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NOINDEX_ROBOTS } from '#customer/app/_lib/seo/metadata';
import { CENTS_ORDER_URL } from '#customer/features/order-entry/config';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export default function ResetPasswordRedirectPage() {
  redirect(CENTS_ORDER_URL);
}
